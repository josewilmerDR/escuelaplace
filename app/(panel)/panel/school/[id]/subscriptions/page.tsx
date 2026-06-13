"use client";

/**
 * School confirmation queue (/panel/school/[id]/subscriptions).
 *
 * The board reviews the pending subscriptions targeting their school and confirms the ones
 * whose payment proof matches what they received. Confirming time-boxes the support
 * (expiresAt); a Cloud Function then recomputes the supporting business's ranking. The
 * board can confirm one at a time or all pending at once.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SubscriptionStatusBadge } from "@/components/subscriptions/SubscriptionStatusBadge";
import {
  confirmSubscription,
  getSchoolById,
  getSubscriptionProofUrl,
  getSubscriptionsBySchool,
  supporterNameOf,
} from "@/lib/firestore";
import { formatColones } from "@/lib/format";
import type { SchoolDoc, SubscriptionDoc } from "@/types";

export default function SchoolSubscriptionsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return getSubscriptionsBySchool(id).then(setSubscriptions);
  }, [id]);

  useEffect(() => {
    Promise.all([getSchoolById(id), getSubscriptionsBySchool(id)])
      .then(([s, subs]) => {
        setSchool(s);
        setSubscriptions(subs);
      })
      .finally(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <p className="text-sm text-gray-500">Cargando…</p>;
  if (!school) return <p className="text-sm text-gray-500">Escuela no encontrada.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return <p className="text-sm text-red-600">No administrás esta escuela.</p>;
  }

  const pending = subscriptions.filter((s) => s.status === "pending");
  const others = subscriptions.filter((s) => s.status !== "pending");

  const confirmOne = async (subId: string) => {
    if (!user) return;
    setBusyId(subId);
    setError(null);
    try {
      await confirmSubscription(subId, user.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (subId: string) => {
    setError(null);
    const url = await getSubscriptionProofUrl(subId);
    if (url) window.open(url, "_blank", "noopener");
    else setError("No se pudo abrir el comprobante.");
  };

  const confirmAll = async () => {
    if (!user || pending.length === 0) return;
    setBusyId("all");
    setError(null);
    try {
      await Promise.all(pending.map((s) => confirmSubscription(s.id, user.id)));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="max-w-2xl">
      <h1 className="text-2xl font-bold">Confirmar apoyos</h1>
      <p className="mt-1 text-sm text-gray-600">{school.name}</p>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pendientes ({pending.length})</h2>
          {pending.length > 0 && (
            <button
              type="button"
              onClick={confirmAll}
              disabled={busyId !== null}
              className="btn btn-primary"
            >
              {busyId === "all" ? "Confirmando…" : "Confirmar todas"}
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No hay apoyos pendientes.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {supporterNameOf(s)}
                    {s.supporterType === "user" && (
                      <span className="ml-2 text-xs font-normal text-muted">
                        Donación personal
                      </span>
                    )}
                  </p>
                  <p className="text-muted">
                    {s.units}× · {formatColones(s.amount)}
                  </p>
                  {s.proofUploaded ? (
                    <button
                      type="button"
                      onClick={() => viewProof(s.id)}
                      className="mt-1 text-xs font-medium text-brand-darker hover:underline"
                    >
                      Ver comprobante
                    </button>
                  ) : (
                    <span className="mt-1 block text-xs text-muted">
                      Sin comprobante
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => confirmOne(s.id)}
                  disabled={busyId !== null}
                  className="btn btn-outline shrink-0"
                >
                  {busyId === s.id ? "Confirmando…" : "Confirmar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Historial</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {others.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {supporterNameOf(s)}
                    {s.supporterType === "user" && (
                      <span className="ml-2 text-xs font-normal text-muted">
                        Donación personal
                      </span>
                    )}
                  </p>
                  <p className="text-muted">
                    {s.units}× · {formatColones(s.amount)}
                  </p>
                </div>
                <SubscriptionStatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm">
        <Link href="/panel" className="underline">
          ← Volver al panel
        </Link>
      </p>
    </main>
  );
}
