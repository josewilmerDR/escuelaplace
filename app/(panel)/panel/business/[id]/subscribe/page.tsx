"use client";

/**
 * Business subscription management (/panel/business/[id]/subscribe).
 *
 * The business owner commits to support a school: pick the school, choose how many units
 * (n × X), and optionally record the SINPE proof reference. This creates a `pending`
 * subscription — the platform never touches the money; the business pays the school
 * directly via SINPE, and the SCHOOL confirms the proof. The school's SINPE is shown only
 * when the school is verified (the data layer gates that).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SubscriptionStatusBadge } from "@/components/subscriptions/SubscriptionStatusBadge";
import {
  createSubscription,
  getBusinessById,
  getSchools,
  getSubscriptionsByBusiness,
  getVerifiedSchoolSinpe,
} from "@/lib/firestore";
import { formatColones } from "@/lib/format";
import { SUBSCRIPTION_UNIT_CRC } from "@/types";
import type {
  BusinessDoc,
  SchoolDoc,
  SchoolPrivate,
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
  const [proofRef, setProofRef] = useState("");
  const [sinpe, setSinpe] = useState<SchoolPrivate["sinpe"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadSubscriptions = useCallback(() => {
    getSubscriptionsByBusiness(id).then(setSubscriptions);
  }, [id]);

  useEffect(() => {
    Promise.all([getBusinessById(id), getSchools(), getSubscriptionsByBusiness(id)])
      .then(([b, s, subs]) => {
        setBusiness(b);
        setSchools(s);
        setSubscriptions(subs);
      })
      .finally(() => setLoaded(true));
  }, [id]);

  // Reveal the chosen school's SINPE (only returns data when the school is verified).
  // Routed through a promise even when empty so setState only happens in the async
  // callback, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    const lookup = schoolId
      ? getVerifiedSchoolSinpe(schoolId)
      : Promise.resolve(null);
    lookup.then((s) => {
      if (!cancelled) setSinpe(s);
    });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  if (!loaded) return <p className="text-sm text-gray-500">Cargando…</p>;
  if (!business) return <p className="text-sm text-gray-500">Comercio no encontrado.</p>;

  const isManager =
    user != null &&
    (business.ownerId === user.id ||
      business.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return <p className="text-sm text-red-600">No administrás este comercio.</p>;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !schoolId) return;
    const school = schools.find((s) => s.id === schoolId);
    if (!school) return;
    setSaving(true);
    setError(null);
    try {
      await createSubscription({
        businessId: business.id,
        businessName: business.name,
        schoolId,
        schoolName: school.name,
        units,
        proofRef: proofRef.trim() || undefined,
      });
      setProofRef("");
      setUnits(1);
      reloadSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el apoyo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-xl">
      <h1 className="text-2xl font-bold">Apoyar una escuela</h1>
      <p className="mt-1 text-sm text-gray-600">{business.name}</p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Escuela</span>
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
        </label>

        {schoolId && (
          <div className="rounded-md bg-surface p-3 text-sm">
            {sinpe ? (
              <p>
                Pagá por SINPE a <span className="font-medium">{sinpe.number}</span> (
                {sinpe.accountHolder}).
              </p>
            ) : (
              <p className="text-amber-800">
                Esta escuela aún no está verificada, así que su SINPE no está disponible.
                Podés registrar el apoyo igual; la escuela lo confirmará al verificarse.
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Cantidad de aportes (cada uno {formatColones(SUBSCRIPTION_UNIT_CRC)})
          </span>
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
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Referencia del comprobante SINPE (opcional)</span>
          <input
            value={proofRef}
            onChange={(e) => setProofRef(e.target.value)}
            placeholder="Ej: número de referencia"
            className="input"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving || !schoolId}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Registrando…" : "Registrar apoyo"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Tus apoyos</h2>
        {subscriptions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            Todavía no registraste ningún apoyo.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {subscriptions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{s.schoolName}</p>
                  <p className="text-muted">
                    {s.units}× · {formatColones(s.amount)}
                  </p>
                </div>
                <SubscriptionStatusBadge status={s.status} />
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
