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
import { Suspense, useCallback, useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { CheckIcon } from "@/components/ui/icons";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DonorTierBadge } from "@/components/donors/DonorTierBadge";
import { RecognitionToggle } from "@/components/donors/RecognitionToggle";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { SchoolPicker } from "@/components/school/SchoolPicker";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { RemindSchoolButton } from "@/components/subscriptions/RemindSchoolButton";
import { SubscriptionStatusBadge } from "@/components/subscriptions/SubscriptionStatusBadge";
import { Field } from "@/components/ui/Field";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormError } from "@/components/ui/FormError";
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
import { SUBSCRIPTION_UNIT_CRC } from "@/types";
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
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const reloadDonations = useCallback(() => {
    if (!user) return Promise.resolve();
    return getSubscriptionsByDonor(user.id).then(setDonations);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getSchoolsCached(),
      getSubscriptionsByDonor(user.id),
      getDonorProfile(user.id),
    ])
      .then(([s, d, p]) => {
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
      .finally(() => setLoaded(true));
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
    if (!schoolId) return;
    const school = schools.find((s) => s.id === schoolId);
    if (!school) return;
    setSaving(true);
    setError(null);
    try {
      // Profile first (private by default) so the Cloud Function has a doc to update
      // the moment the school confirms.
      await ensureDonorProfile(user.id, user.name);
      const newId = await createDonation({
        donorId: user.id,
        donorName: user.name,
        schoolId,
        schoolName: school.name,
        units,
      });
      if (proofFile) await uploadSubscriptionProof(newId, proofFile);
      setProofFile(null);
      setUnits(1);
      await reloadDonations();
      if (!profile) setProfile(await getDonorProfile(user.id));
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar la donación."));
    } finally {
      setSaving(false);
    }
  };

  const onUploadProof = async (subId: string, file: File) => {
    setUploadingId(subId);
    setError(null);
    try {
      await uploadSubscriptionProof(subId, file);
      await reloadDonations();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo subir el comprobante."));
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
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5">
          {profile?.tier && <DonorTierBadge tier={profile.tier} />}
          {(profile?.projectsSupported ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-darker">
              {profile?.projectsSupported === 1
                ? "Participaste en 1 proyecto"
                : `Participaste en ${profile?.projectsSupported} proyectos`}
            </span>
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
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Escuela</span>
          <SchoolPicker schools={schools} value={schoolId} onChange={setSchoolId} />
        </div>

        {schoolId && (
          <div className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5">
            <PaymentMethodsInfo
              methods={methods}
              confirmationTimeMs={confirmMs}
              unverifiedText="Esta escuela aún no está verificada, así que sus métodos de pago no están disponibles. Podés registrar la donación igual; la escuela la confirmará al verificarse."
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
          hint="No se publica en tu perfil ni en el catálogo; la escuela lo usa para confirmar tu aporte."
          value={proofFile}
          onChange={setProofFile}
        />

        {/* Account-wide recognition preference (not per-donation): autosaves on toggle, with
            the display name editable on the settings page it links to. */}
        <RecognitionToggle compact />

        <FormError message={error} />

        <button
          type="submit"
          disabled={saving || !schoolId}
          className="btn btn-primary"
        >
          {saving ? "Registrando…" : "Registrar donación"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tus donaciones
        </h2>
        {donations.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no registraste ninguna donación.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {donations.map((d) => {
              const isPending = d.status === "pending";
              const school = schools.find((x) => x.id === d.schoolId);
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5"
                >
                  <div>
                    <p className="font-semibold tracking-tight text-foreground">
                      {d.schoolName}
                    </p>
                    <p className="text-muted">
                      {d.units}× · {formatColones(d.amount)} ·{" "}
                      {d.proofUploaded ? (<span className="inline-flex items-center gap-1 text-success"><CheckIcon className="h-3.5 w-3.5" />Comprobante</span>) : "Sin comprobante"}
                    </p>
                    {/* Waiting on the school: how long, plus a nudge through the school's
                        own channel. The platform never confirms the money. */}
                    {isPending && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <PendingAge since={d.createdAt} />
                        <RemindSchoolButton
                          boardContact={school?.boardContact}
                          supporterName={user.name}
                          schoolName={d.schoolName}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer text-xs font-medium text-brand-darker hover:underline">
                      {uploadingId === d.id
                        ? "Subiendo…"
                        : d.proofUploaded
                          ? "Reemplazar"
                          : "Subir comprobante"}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        disabled={uploadingId !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUploadProof(d.id, f);
                        }}
                      />
                    </label>
                    <SubscriptionStatusBadge status={d.status} />
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
