"use client";

/**
 * Business subscription management (/panel/business/[id]/subscribe).
 *
 * The business owner commits to support a school: pick the school, choose how many units
 * (n × X), and optionally attach the payment proof file. This creates a `pending`
 * subscription — the platform never touches the money; the business pays the school
 * directly through whatever payment method the school published, and the SCHOOL confirms
 * the proof. The proof file goes to private Storage (not the public doc). The school's
 * payment methods are shown only when verified.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BusinessPanelNav } from "@/components/business/BusinessPanelNav";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { SchoolPicker } from "@/components/school/SchoolPicker";
import { UNVERIFIED_SUBSCRIPTION_TEXT } from "@/components/school/UnverifiedSchoolNotice";
import { SupporterContributionItem } from "@/components/subscriptions/SupporterContributionItem";
import { cardClass } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormError } from "@/components/ui/FormError";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import {
  averageConfirmationTimeMs,
  createSubscription,
  getBusinessById,
  getSchoolsCached,
  getSubscriptionsByBusiness,
  getSubscriptionsBySchool,
  getVerifiedSchoolPaymentMethods,
  uploadSubscriptionProof,
} from "@/lib/firestore";
import { formatColones } from "@/lib/format";
import { SUBSCRIPTION_UNIT_CRC, SUBSCRIPTION_UNITS_MAX } from "@/types";
import type {
  BusinessDoc,
  PaymentMethod,
  SchoolDoc,
  SubscriptionDoc,
} from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

/**
 * Loading shell. Renders the SAME static header (title + business name) the loaded page
 * does, so navigating here paints the heading instantly in its final position and only the
 * form below fades in — no blank flash ("parpadeo") during the Firestore reads.
 */
function SubscribeSkeleton({ business }: { business: BusinessDoc | null }) {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Apoyar una escuela
      </h1>
      <p className="mt-1 text-sm text-muted">{business?.name ?? " "}</p>
      <div className="mt-8 space-y-3" aria-hidden="true">
        <div className="h-10 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-10 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </div>
      <p className="sr-only" role="status">
        Cargando…
      </p>
    </main>
  );
}

export default function BusinessSubscribePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Ties the visible "Escuela" group label to the picker (which is not a single <label>).
  const schoolLabelId = useId();

  const [business, setBusiness] = useState<BusinessDoc | null>(null);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Form state
  const [schoolId, setSchoolId] = useState("");
  const [units, setUnits] = useState(1);
  const [proofFile, setProofFile] = useState<File | null>(null);
  // null = school not verified (payment data hidden); [] = verified but none published.
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  // Average first-confirmation time of the chosen school; null until known.
  const [confirmMs, setConfirmMs] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Error of a per-row proof upload — shown next to the list, not in the form's FormError.
  const [listError, setListError] = useState<string | null>(null);

  const reloadSubscriptions = useCallback(() => {
    return getSubscriptionsByBusiness(id).then(setSubscriptions);
  }, [id]);

  // Initial load: on a Firestore failure land on "error" (Reintentar) instead of a null
  // business, so a transient network blip doesn't read as "Comercio no encontrado".
  const load = useCallback(() => {
    Promise.all([getBusinessById(id), getSchoolsCached(), getSubscriptionsByBusiness(id)])
      .then(([b, s, subs]) => {
        setBusiness(b);
        setSchools(s);
        setSubscriptions(subs);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  // Reveal the chosen school's payment methods (only when the school is verified)
  // and its typical confirmation time (public data — shown in any state). Routed
  // through a promise even when empty so setState only happens in the async
  // callback, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    const lookup = schoolId
      ? Promise.all([
          getVerifiedSchoolPaymentMethods(schoolId),
          getSubscriptionsBySchool(schoolId).then(averageConfirmationTimeMs),
        ])
      : Promise.resolve([null, null] as const);
    lookup.then(([m, avg]) => {
      if (cancelled) return;
      setMethods(m);
      setConfirmMs(avg);
    });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  // Index schools by id so each list row resolves its boardContact without a per-row scan.
  const schoolById = useMemo(
    () => new Map(schools.map((s) => [s.id, s])),
    [schools],
  );

  if (loadState === "loading") {
    return <SubscribeSkeleton business={business} />;
  }

  if (loadState === "error") {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Apoyar una escuela
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los datos. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!business) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Apoyar una escuela
        </h1>
        <p role="alert" className="mt-4 text-sm text-muted">
          Comercio no encontrado.
        </p>
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager = isPageManager(business, user);

  if (!isManager) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Apoyar una escuela
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No administras este comercio.
        </p>
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Tu sesión expiró. Vuelve a ingresar.");
      return;
    }
    if (!schoolId) return; // the submit button is disabled without a school
    const school = schools.find((s) => s.id === schoolId);
    if (!school) return;
    const safeUnits = Math.max(1, Math.floor(units) || 1);
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      // The subscription is created first and exists from this point on; a later proof
      // upload failure must NOT read as "couldn't register the support". So we reload the
      // list and reset the form regardless, and only surface a distinct, softer message if
      // it was specifically the proof upload that failed.
      const newId = await createSubscription({
        businessId: business.id,
        businessName: business.name,
        schoolId,
        schoolName: school.name,
        units: safeUnits,
      });
      let proofFailed = false;
      if (proofFile) {
        try {
          await uploadSubscriptionProof(newId, proofFile);
        } catch {
          proofFailed = true;
        }
      }
      setProofFile(null);
      setUnits(1);
      await reloadSubscriptions();
      if (proofFailed) {
        setError(
          "Apoyo registrado, pero no se pudo subir el comprobante. Puedes subirlo desde la lista.",
        );
      } else {
        setDone(true);
      }
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar el apoyo."));
    } finally {
      setSaving(false);
    }
  };

  const onUploadProof = async (subId: string, file: File) => {
    setUploadingId(subId);
    setListError(null);
    try {
      await uploadSubscriptionProof(subId, file);
      await reloadSubscriptions();
    } catch (err) {
      setListError(userErrorMessage(err, "No se pudo subir el comprobante."));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Apoyar una escuela
      </h1>
      <p className="mt-1 text-sm text-muted">{business.name}</p>

      <BusinessPanelNav
        businessId={id}
        active={business.status === "active"}
        current="subscribe"
      />

      {/* No card around the form: the controls sit directly on the page (matching the donate
          flow). The platform never touches the money; this only records a `pending`
          subscription the school later confirms. */}
      <form
        onSubmit={onSubmit}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
        {/* Not a <Field>: the picker holds several controls (carousel buttons, a link and a
            search input), which can't live inside a single wrapping <label>. The submit
            button stays disabled until a school is chosen, so no native `required` is needed. */}
        <div
          role="group"
          aria-labelledby={schoolLabelId}
          className="flex flex-col gap-1 text-sm"
        >
          <span id={schoolLabelId} className="font-medium">
            Escuela
          </span>
          <SchoolPicker schools={schools} value={schoolId} onChange={setSchoolId} />
        </div>

        {schoolId && (
          <div className={`text-sm ${cardClass("inset")}`}>
            <PaymentMethodsInfo
              methods={methods}
              confirmationTimeMs={confirmMs}
              unverifiedText={UNVERIFIED_SUBSCRIPTION_TEXT}
            />
          </div>
        )}

        <Field
          label={`Cantidad de aportes (cada uno ${formatColones(SUBSCRIPTION_UNIT_CRC)})`}
        >
          <input
            type="number"
            min={1}
            max={SUBSCRIPTION_UNITS_MAX}
            required
            // Allow an empty display while editing (don't snap to 1 on backspace); the value
            // is normalized to the [1, SUBSCRIPTION_UNITS_MAX] range on blur. The upper clamp
            // on change keeps a typo (an extra zero) from ever reaching state/submit.
            value={units || ""}
            onChange={(e) =>
              setUnits(
                Math.min(SUBSCRIPTION_UNITS_MAX, Math.max(0, Number(e.target.value) || 0)),
              )
            }
            onBlur={() =>
              setUnits((u) =>
                Math.min(SUBSCRIPTION_UNITS_MAX, Math.max(1, Math.floor(u) || 1)),
              )
            }
            className="input"
          />
          <span className="text-muted">
            Total: {formatColones(Math.max(1, units) * SUBSCRIPTION_UNIT_CRC)}
          </span>
        </Field>

        <FilePicker
          label="Comprobante de pago (opcional)"
          hint="No se publica en tu perfil ni en el catálogo; la escuela lo usa para confirmar tu apoyo."
          value={proofFile}
          onChange={setProofFile}
        />

        <FormError message={error} />
        {done && (
          <p
            role="status"
            className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10"
          >
            ¡Apoyo registrado! La escuela lo confirmará por su cuenta; mientras
            tanto lo ves abajo como pendiente.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !schoolId || uploadingId !== null}
          aria-busy={saving}
          className="btn btn-primary"
        >
          {saving ? "Registrando…" : "Registrar apoyo"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tus apoyos
        </h2>
        {listError && (
          <p role="alert" className="mt-2 text-sm text-error">
            {listError}
          </p>
        )}
        {subscriptions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no registraste ningún apoyo.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {subscriptions.map((s) => (
              <SupporterContributionItem
                key={s.id}
                subscription={s}
                supporterName={business.name}
                boardContact={schoolById.get(s.schoolId)?.boardContact}
                uploadingId={uploadingId}
                onUploadProof={onUploadProof}
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
