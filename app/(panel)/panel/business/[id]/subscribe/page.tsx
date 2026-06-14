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
import { useCallback, useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { CheckIcon } from "@/components/ui/icons";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BusinessPanelNav } from "@/components/business/BusinessPanelNav";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { RemindSchoolButton } from "@/components/subscriptions/RemindSchoolButton";
import { SubscriptionStatusBadge } from "@/components/subscriptions/SubscriptionStatusBadge";
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
import { SUBSCRIPTION_UNIT_CRC } from "@/types";
import type {
  BusinessDoc,
  PaymentMethod,
  SchoolDoc,
  SubscriptionDoc,
} from "@/types";

export default function BusinessSubscribePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [business, setBusiness] = useState<BusinessDoc | null>(null);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDoc[]>([]);
  const [loaded, setLoaded] = useState(false);

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
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const reloadSubscriptions = useCallback(() => {
    getSubscriptionsByBusiness(id).then(setSubscriptions);
  }, [id]);

  useEffect(() => {
    Promise.all([getBusinessById(id), getSchoolsCached(), getSubscriptionsByBusiness(id)])
      .then(([b, s, subs]) => {
        setBusiness(b);
        setSchools(s);
        setSubscriptions(subs);
      })
      .finally(() => setLoaded(true));
  }, [id]);

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

  if (!loaded) return <p className="text-sm text-muted">Cargando…</p>;
  if (!business) return <p className="text-sm text-muted">Comercio no encontrado.</p>;

  const isManager =
    user != null &&
    (business.ownerId === user.id ||
      business.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return <p className="text-sm text-error">No administrás este comercio.</p>;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Tu sesión expiró. Volvé a ingresar.");
      return;
    }
    if (!schoolId) return; // the submit button is disabled without a school
    const school = schools.find((s) => s.id === schoolId);
    if (!school) return;
    setSaving(true);
    setError(null);
    let newId: string;
    try {
      newId = await createSubscription({
        businessId: business.id,
        businessName: business.name,
        schoolId,
        schoolName: school.name,
        units,
      });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar el apoyo."));
      setSaving(false);
      return;
    }
    // The subscription exists now — surface it immediately. A proof upload that fails
    // below must NOT read as "the support didn't register": it did, and the proof can be
    // re-attached from the list, so the two failures get distinct messages.
    setUnits(1);
    reloadSubscriptions();
    if (proofFile) {
      try {
        await uploadSubscriptionProof(newId, proofFile);
      } catch {
        // Keep the "your support DID register" framing — a raw upload/storage error here
        // would wrongly read as the whole action failing.
        setError(
          "Registramos tu apoyo, pero no se pudo subir el comprobante. Podés subirlo desde “Tus apoyos”, más abajo.",
        );
        setSaving(false);
        return;
      }
    }
    setProofFile(null);
    setSaving(false);
  };

  const onUploadProof = async (subId: string, file: File) => {
    setUploadingId(subId);
    setError(null);
    try {
      await uploadSubscriptionProof(subId, file);
      reloadSubscriptions();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo subir el comprobante."));
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

      {/* The support form on one elevated surface — the school choice, units math and
          optional proof upload. The platform never touches the money; this only records a
          `pending` subscription the school later confirms. */}
      <form
        onSubmit={onSubmit}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className={`mt-8 flex flex-col gap-4 ${cardClass()}`}
      >
        <Field label="Escuela">
          <select
            required
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="input"
          >
            <option value="">Elegí una escuela…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        {schoolId && (
          <div className="rounded-xl bg-surface p-3 text-sm ring-1 ring-black/5">
            <PaymentMethodsInfo
              methods={methods}
              confirmationTimeMs={confirmMs}
              unverifiedText="Esta escuela aún no está verificada, así que sus métodos de pago no están disponibles. Podés registrar el apoyo igual; la escuela lo confirmará al verificarse."
            />
          </div>
        )}

        <Field
          label={`Cantidad de aportes (cada uno ${formatColones(SUBSCRIPTION_UNIT_CRC)})`}
        >
          <input
            type="number"
            min={1}
            required
            value={units}
            onChange={(e) => setUnits(Math.max(1, Number(e.target.value) || 1))}
            className="input"
          />
          <span className="text-muted">
            Total: {formatColones(units * SUBSCRIPTION_UNIT_CRC)}
          </span>
        </Field>

        <FilePicker
          label="Comprobante de pago (opcional)"
          hint="No se publica en tu perfil ni en el catálogo; la escuela lo usa para confirmar tu apoyo."
          value={proofFile}
          onChange={setProofFile}
        />

        <FormError message={error} />

        <button
          type="submit"
          disabled={saving || !schoolId}
          className="btn btn-primary"
        >
          {saving ? "Registrando…" : "Registrar apoyo"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tus apoyos
        </h2>
        {subscriptions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no registraste ningún apoyo.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {subscriptions.map((s) => {
              const isPending = s.status === "pending";
              const school = schools.find((x) => x.id === s.schoolId);
              return (
                <li
                  key={s.id}
                  className={`flex items-center justify-between gap-3 p-4 text-sm ${cardClass("elevated", false)}`}
                >
                  <div>
                    <p className="font-medium">{s.schoolName}</p>
                    <p className="text-muted">
                      {s.units}× · {formatColones(s.amount)} ·{" "}
                      {s.proofUploaded ? (<span className="inline-flex items-center gap-1 text-success"><CheckIcon className="h-3.5 w-3.5" />Comprobante</span>) : "Sin comprobante"}
                    </p>
                    {/* Waiting on the school: show how long, and offer a nudge through the
                        school's own channel. The platform never confirms the money. */}
                    {isPending && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <PendingAge since={s.createdAt} />
                        <RemindSchoolButton
                          boardContact={school?.boardContact}
                          supporterName={business.name}
                          schoolName={s.schoolName}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer text-xs font-medium text-brand-darker hover:underline">
                      {uploadingId === s.id
                        ? "Subiendo…"
                        : s.proofUploaded
                          ? "Reemplazar"
                          : "Subir comprobante"}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        disabled={uploadingId !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUploadProof(s.id, f);
                        }}
                      />
                    </label>
                    <SubscriptionStatusBadge status={s.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
