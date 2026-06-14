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
import { BackLink } from "@/components/ui/BackLink";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PendingAge } from "@/components/subscriptions/PendingAge";
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

  if (!loaded) return <p className="text-sm text-muted">Cargando…</p>;
  if (!school) return <p className="text-sm text-muted">Escuela no encontrada.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return <p className="text-sm text-error">No administrás esta escuela.</p>;
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
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Confirmar apoyos
      </h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Pendientes ({pending.length})
          </h2>
          {/* Bulk action is a quiet secondary; the per-row "Confirmar" is the primary. */}
          {pending.length > 0 && (
            <button
              type="button"
              onClick={confirmAll}
              disabled={busyId !== null}
              className="btn btn-outline"
            >
              {busyId === "all" ? "Confirmando…" : "Confirmar todas"}
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-error">{error}</p>}

        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No hay apoyos pendientes.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {pending.map((s) => (
              // Elevated calm-depth row per pending support, with its own primary confirm.
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-black/5"
              >
                <div>
                  <p className="font-semibold tracking-tight text-foreground">
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
                  {/* How long this support has waited — amber once it's stale, so an old
                      queue is visible at a glance. */}
                  <PendingAge since={s.createdAt} />
                </div>
                <button
                  type="button"
                  onClick={() => confirmOne(s.id)}
                  disabled={busyId !== null}
                  className="btn btn-primary shrink-0"
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
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Historial
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {others.map((s) => (
              // History is settled: a quieter inset panel, no primary action.
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5"
              >
                <div>
                  <p className="font-semibold tracking-tight text-foreground">
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
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
