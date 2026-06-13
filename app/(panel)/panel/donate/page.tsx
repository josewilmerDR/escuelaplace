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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DonorTierBadge } from "@/components/donors/DonorTierBadge";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { SubscriptionStatusBadge } from "@/components/subscriptions/SubscriptionStatusBadge";
import { Field } from "@/components/ui/Field";
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
  updateDonorRecognition,
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
    <Suspense fallback={<p className="text-sm text-gray-500">Cargando…</p>}>
      <DonateContent />
    </Suspense>
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

  // Recognition preferences state
  const [prefName, setPrefName] = useState("");
  const [prefPublic, setPrefPublic] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);

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
        setPrefName(p?.displayName ?? user.name);
        setPrefPublic(p?.isPublic ?? false);
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
    return <p className="text-sm text-gray-500">Cargando…</p>;
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

  const onSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefSaving(true);
    setPrefSaved(false);
    setError(null);
    try {
      const displayName = prefName.trim() || user.name;
      await ensureDonorProfile(user.id, displayName);
      await updateDonorRecognition(user.id, {
        displayName,
        isPublic: prefPublic,
      });
      setProfile(await getDonorProfile(user.id));
      setPrefSaved(true);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar las preferencias."));
    } finally {
      setPrefSaving(false);
    }
  };

  return (
    <main className="max-w-xl">
      <h1 className="text-2xl font-bold">Donar a una escuela</h1>
      <p className="mt-1 text-sm text-gray-600">
        Tu aporte va directo a la escuela por el medio de pago que ella misma
        publica; la plataforma nunca toca el dinero. La escuela confirma cada
        donación.
      </p>

      {profile?.tier && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm">
          <DonorTierBadge tier={profile.tier} />
          {profile.firstConfirmedAt && (
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
          <div className="rounded-md bg-surface p-3 text-sm">
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

        <Field label="Comprobante de pago (opcional)">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <span className="text-muted">
            Solo lo ven la escuela y vos. No se publica.
          </span>
        </Field>

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
        <h2 className="text-lg font-semibold">Reconocimiento público</h2>
        <p className="mt-1 text-sm text-gray-600">
          Por defecto tu donación es anónima: contás en los totales de la escuela,
          pero tu nombre no se publica. Si querés, podés aparecer en el muro de
          agradecimiento con tu nivel de donante.
        </p>
        <form onSubmit={onSavePrefs} className="mt-3 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefPublic}
              onChange={(e) => {
                setPrefPublic(e.target.checked);
                setPrefSaved(false);
              }}
            />
            <span>Mostrar mi nombre en el muro de agradecimiento</span>
          </label>
          {prefPublic && (
            <Field label="Nombre a mostrar">
              <input
                type="text"
                value={prefName}
                onChange={(e) => {
                  setPrefName(e.target.value);
                  setPrefSaved(false);
                }}
                maxLength={60}
                className="input"
              />
            </Field>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={prefSaving}
              className="btn btn-outline self-start"
            >
              {prefSaving ? "Guardando…" : "Guardar preferencias"}
            </button>
            {prefSaved && (
              <span className="text-xs text-green-700">Preferencias guardadas.</span>
            )}
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Tus donaciones</h2>
        {donations.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            Todavía no registraste ninguna donación.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {donations.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{d.schoolName}</p>
                  <p className="text-muted">
                    {d.units}× · {formatColones(d.amount)} ·{" "}
                    {d.proofUploaded ? "Comprobante ✓" : "Sin comprobante"}
                  </p>
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
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm">
        <Link href="/panel" className="underline">
          ← Volver al panel
        </Link>
      </p>
    </main>
  );
}
