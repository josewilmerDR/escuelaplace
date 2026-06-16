"use client";

/**
 * Personal donation flow (/panel/donate).
 *
 * Any signed-in user — no page needed, no commercial intent — donates to a school: pick
 * the school, choose how many units (n × X), optionally attach the payment proof. Same
 * lifecycle as a business subscription: the platform never touches the money; the SCHOOL
 * confirms the proof. Confirmed donations feed the donor's recognition tier
 * (donorProfiles), which is shown publicly only if the donor opts in.
 */
import { Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DonorTierBadge } from "@/components/donors/DonorTierBadge";
import { RecognitionToggle } from "@/components/donors/RecognitionToggle";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { SchoolPicker } from "@/components/school/SchoolPicker";
import { UNVERIFIED_DONATION_TEXT } from "@/components/school/UnverifiedSchoolNotice";
import { SupporterContributionItem } from "@/components/subscriptions/SupporterContributionItem";
import { cardClass } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormError } from "@/components/ui/FormError";
import { StatChip } from "@/components/ui/StatChip";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import {
  averageConfirmationTimeMs,
  createDonation,
  ensureDonorProfile,
  getDonorProfile,
  getSchoolsCached,
  getSubscriptionsByDonor,
  getSubscriptionsBySchool,
  getVerifiedSchoolPaymentMethods,
  uploadSubscriptionProof,
} from "@/lib/firestore";
import { formatColones } from "@/lib/format";
import { SUBSCRIPTION_UNIT_CRC, SUBSCRIPTION_UNITS_MAX } from "@/types";
import type {
  DonorProfileDoc,
  PaymentMethod,
  SchoolDoc,
  SubscriptionDoc,
} from "@/types";

export default function DonatePage() {
  // useSearchParams needs a Suspense boundary to keep the route statically renderable.
  return (
    <Suspense fallback={<DonateSkeleton />}>
      <DonateContent />
    </Suspense>
  );
}

/**
 * Loading shell. Renders the SAME static header (title + intro) the loaded page does, so
 * navigating here paints the heading instantly in its final position and only the form
 * below fades in — no blank flash ("parpadeo") during the Firestore reads. Used by BOTH
 * the Suspense fallback and the in-component `!loaded` state so the two are identical.
 */
function DonateSkeleton() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Donar a una escuela
      </h1>
      <p className="mt-1 text-sm text-muted">
        Tu aporte va directo a la escuela por el medio de pago que ella misma
        publica; la plataforma nunca toca el dinero. La escuela confirma cada
        donación.
      </p>
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-10 animate-pulse rounded-xl bg-surface ring-1 ring-black/5" />
        <div className="h-10 animate-pulse rounded-xl bg-surface ring-1 ring-black/5" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </div>
      <p className="sr-only" role="status">
        Cargando…
      </p>
    </main>
  );
}

function DonateContent() {
  const { user } = useAuth();
  // The school page's "Donar" button lands here with the school preselected.
  const preselectedSchoolId = useSearchParams().get("schoolId") ?? "";
  // Ties the visible "Escuela" group label to the picker (which is not a single <label>).
  const schoolLabelId = useId();

  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [donations, setDonations] = useState<SubscriptionDoc[]>([]);
  const [profile, setProfile] = useState<DonorProfileDoc | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Donation form state
  const [schoolId, setSchoolId] = useState(preselectedSchoolId);
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

  const reloadDonations = useCallback(() => {
    if (!user) return Promise.resolve();
    return getSubscriptionsByDonor(user.id).then(setDonations);
  }, [user]);

  // Index schools by id so each list row resolves its boardContact without a per-row scan.
  const schoolById = useMemo(
    () => new Map(schools.map((s) => [s.id, s])),
    [schools],
  );

  useEffect(() => {
    if (!user) return;
    // Drop a stale result if the account switches (or the component unmounts) before the
    // reads resolve, so the previous user's donations never flash into the new session.
    let cancelled = false;
    Promise.all([
      getSchoolsCached(),
      getSubscriptionsByDonor(user.id),
      getDonorProfile(user.id),
    ])
      .then(([s, d, p]) => {
        if (cancelled) return;
        setSchools(s);
        // A stale/foreign ?schoolId must not leave the form pointing at a school
        // that isn't in the list (the select would render blank but "valid").
        if (
          preselectedSchoolId &&
          !s.some((school) => school.id === preselectedSchoolId)
        ) {
          setSchoolId("");
        }
        setDonations(d);
        setProfile(p);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, preselectedSchoolId]);

  // Reveal the chosen school's payment methods (only when the school is verified)
  // and its typical confirmation time (public data — shown in any state).
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

  if (!user || !loaded) {
    return <DonateSkeleton />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return; // the submit button is disabled without a school
    const school = schools.find((s) => s.id === schoolId);
    if (!school) return;
    const safeUnits = Math.max(1, Math.floor(units) || 1);
    setSaving(true);
    setError(null);
    setDone(false);

    // Phase 1 — record the donation. A failure here means nothing was created, so it's the
    // only failure that invalidates the whole action.
    let newId: string;
    try {
      // Profile first (private by default) so the Cloud Function has a doc to update
      // the moment the school confirms.
      await ensureDonorProfile(user.id, user.name);
      newId = await createDonation({
        donorId: user.id,
        donorName: user.name,
        schoolId,
        schoolName: school.name,
        units: safeUnits,
      });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar la donación."));
      setSaving(false);
      return;
    }

    // Phase 2 — the donation now exists (pending). The optional proof upload is best-effort:
    // if it fails we must NOT claim the donation failed (that led to duplicate donations on
    // retry). We surface a proof-specific note and leave the row's "Subir comprobante" to
    // recover it.
    const file = proofFile;
    setProofFile(null);
    setUnits(1);
    try {
      if (file) await uploadSubscriptionProof(newId, file);
      setDone(true);
    } catch (err) {
      setError(
        userErrorMessage(
          err,
          "La donación se registró, pero no se pudo subir el comprobante. Podés subirlo desde la lista.",
        ),
      );
    }
    await reloadDonations();
    // Prime the recognition profile state for a brand-new donor so a later confirmation can
    // light up the tier band without a reload (the freshly created profile is still zeroed).
    if (!profile) setProfile(await getDonorProfile(user.id));
    setSaving(false);
  };

  const onUploadProof = async (subId: string, file: File) => {
    setUploadingId(subId);
    setListError(null);
    try {
      await uploadSubscriptionProof(subId, file);
      await reloadDonations();
    } catch (err) {
      setListError(userErrorMessage(err, "No se pudo subir el comprobante."));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Donar a una escuela
      </h1>
      <p className="mt-1 text-sm text-muted">
        Tu aporte va directo a la escuela por el medio de pago que ella misma
        publica; la plataforma nunca toca el dinero. La escuela confirma cada
        donación.
      </p>

      {(profile?.tier || (profile?.projectsSupported ?? 0) > 0) && (
        <div className={`mt-6 flex flex-wrap items-center gap-2 text-sm ${cardClass("inset")}`}>
          {profile?.tier && <DonorTierBadge tier={profile.tier} />}
          {(profile?.projectsSupported ?? 0) > 0 && (
            <StatChip tone="brand">
              {profile?.projectsSupported === 1
                ? "Participaste en 1 proyecto"
                : `Participaste en ${profile?.projectsSupported} proyectos`}
            </StatChip>
          )}
          {profile?.firstConfirmedAt && (
            <span className="text-muted">
              Donante desde {profile.firstConfirmedAt.toDate().getFullYear()}
            </span>
          )}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
        {/* Not a <Field>: the picker holds several controls (carousel buttons, a link and
            a search input), which can't live inside a single wrapping <label>. The submit
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
              unverifiedText={UNVERIFIED_DONATION_TEXT}
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
          hint="No se publica en tu perfil ni en el catálogo; la escuela lo usa para confirmar tu aporte."
          value={proofFile}
          onChange={setProofFile}
        />

        {/* Account-wide recognition preference (not per-donation): autosaves on toggle; the
            display name is edited inline (no jump to settings that would discard the form). */}
        <RecognitionToggle compact />

        <FormError message={error} />
        {done && (
          <p
            role="status"
            className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10"
          >
            ¡Donación registrada! La escuela la confirmará por su cuenta; mientras
            tanto la ves abajo como pendiente.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !schoolId || uploadingId !== null}
          aria-busy={saving}
          className="btn btn-primary"
        >
          {saving ? "Registrando…" : "Registrar donación"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tus donaciones
        </h2>
        {listError && (
          <p role="alert" className="mt-2 text-sm text-error">
            {listError}
          </p>
        )}
        {donations.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no registraste ninguna donación.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {donations.map((d) => (
              <SupporterContributionItem
                key={d.id}
                subscription={d}
                supporterName={user.name}
                boardContact={schoolById.get(d.schoolId)?.boardContact}
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
