"use client";

/**
 * School confirmation queue (/panel/school/[id]/subscriptions).
 *
 * The board reviews the pending subscriptions targeting their school and confirms the ones
 * whose payment proof matches what they received. Confirming time-boxes the support
 * (expiresAt); a Cloud Function then recomputes the supporting business's ranking. The
 * board can confirm one at a time or all pending at once.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartIcon } from "@/components/ui/icons";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { SubscriptionStatusBadge } from "@/components/subscriptions/SubscriptionStatusBadge";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import {
  confirmSubscription,
  getSchoolById,
  getSubscriptionProofUrl,
  getSubscriptionsBySchool,
  supporterNameOf,
} from "@/lib/firestore";
import { formatColones } from "@/lib/format";
import type { SchoolDoc, SubscriptionDoc } from "@/types";

/** Lifecycle of the initial school + subscriptions fetch. */
type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando apoyos…";

/**
 * The page heading, rendered identically in every state (loading, error, loaded) so the
 * title never shifts as content swaps in. The subtitle takes the school name; during loading
 * the school isn't known yet, so the subtitle renders blank (a non-breaking space keeps the
 * line height reserved) and the h1 stays fixed.
 */
function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Confirmar apoyos
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

export default function SchoolSubscriptionsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accessible-only success feedback, announced via an aria-live region (no visual banner).
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    return getSubscriptionsBySchool(id).then(setSubscriptions);
  }, [id]);

  // Initial load: on a Firestore failure land on "error" (Reintentar) instead of
  // a null school, so a transient network blip doesn't read as "Escuela no encontrada".
  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getSubscriptionsBySchool(id)])
      .then(([s, subs]) => {
        setSchool(s);
        setSubscriptions(subs);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  // Split the queue once per data change instead of on every render.
  const pending = useMemo(
    () => subscriptions.filter((s) => s.status === "pending"),
    [subscriptions],
  );
  const others = useMemo(
    () => subscriptions.filter((s) => s.status !== "pending"),
    [subscriptions],
  );

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        {/* School not loaded yet → blank subtitle, but the h1 sits in its final position. */}
        <Heading />
        <ul className="mt-8 flex flex-col gap-4" aria-hidden="true">
          <li className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </ul>
        <p className="sr-only" role="status">
          {LOADING_TEXT}
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los apoyos. Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <main>
        <Heading />
        <p className="mt-4 text-sm text-muted">Escuela no encontrada.</p>
        <p className="mt-8 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return (
      <main>
        <Heading />
        <p className="mt-4 text-sm text-error">No administrás esta escuela.</p>
        <p className="mt-8 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const confirmOne = async (subId: string) => {
    if (!user) return;
    setBusyId(subId);
    setError(null);
    setStatus(null);
    try {
      await confirmSubscription(subId, user.id);
      await reload();
      setStatus("Apoyo confirmado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  // The explicit-count guard now lives in <ConfirmDialog> (confirmAllOpen, declared with the
  // other state above); this just does the work once confirmed.
  const confirmAll = async () => {
    if (!user || pending.length === 0) return;
    setBusyId("all");
    setError(null);
    setStatus(null);
    const total = pending.length;
    try {
      // allSettled (not all): one failed confirm must not block the others, and we always
      // reload so successfully-confirmed rows disappear even on a partial failure.
      const results = await Promise.allSettled(
        pending.map((s) => confirmSubscription(s.id, user.id)),
      );
      await reload();
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setError(`No se pudieron confirmar ${failed} de ${total} apoyos.`);
      } else {
        setStatus(`${total} apoyos confirmados.`);
      }
    } catch (err) {
      // reload() itself failed — the confirms may still have gone through.
      setError(err instanceof Error ? err.message : "No se pudieron confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (subId: string) => {
    setError(null);
    setStatus(null);
    const url = await getSubscriptionProofUrl(subId);
    if (!url) {
      setError("No se pudo abrir el comprobante.");
      return;
    }
    // A blocked popup returns null too — surface the same error so the click isn't silent.
    const win = window.open(url, "_blank", "noopener");
    if (!win) setError("No se pudo abrir el comprobante.");
  };

  // Nothing at all: pending AND history both empty.
  if (subscriptions.length === 0) {
    return (
      <main>
        <Heading subtitle={school.name} />
        <div className="mt-8">
          <EmptyState
            icon={<HeartIcon className="h-7 w-7" />}
            title="Todavía no hay apoyos a tu escuela"
            description="Cuando un comercio o donante apoye tu escuela, su apoyo aparecerá acá para que lo confirmes."
          />
        </div>
        <p className="mt-8 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  return (
    <main>
      <Heading subtitle={school.name} />

      <SchoolPanelNav schoolId={id} current="subscriptions" />

      {/* Accessible-only success announcement; no visual banner is needed. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Pendientes ({pending.length})
          </h2>
          {/* Bulk action is a quiet secondary; the per-row "Confirmar" is the primary. The
              bulk button stays disabled for any in-flight work (busyId !== null), while each
              per-row button only disables for its own row or a bulk run (see below). */}
          {pending.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmAllOpen(true)}
              disabled={busyId !== null}
              className="btn btn-outline"
            >
              {busyId === "all" ? "Confirmando…" : "Confirmar todos"}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}

        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No hay apoyos pendientes.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {pending.map((s) => (
              // Elevated calm-depth row per pending support, with its own primary confirm.
              <li
                key={s.id}
                className={`${cardClass("elevated")} flex items-center justify-between gap-3 text-sm`}
              >
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight text-foreground">
                    {supporterNameOf(s)}
                    {s.supporterType === "user" && (
                      <Badge tone="info" className="ml-2">
                        Donación personal
                      </Badge>
                    )}
                  </p>
                  {/* Subscriptions are always CRC (SUBSCRIPTION_UNIT_CRC) — keep formatColones,
                      do not swap to formatMoney. */}
                  <p className="text-muted">
                    {s.units}× · {formatColones(s.amount)}
                  </p>
                  {s.proofUploaded ? (
                    <button
                      type="button"
                      onClick={() => viewProof(s.id)}
                      // Always-underlined + min tap height: hover:underline is invisible on touch.
                      className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-brand-darker underline"
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
                  // Only this row (or a bulk run) disables it — confirming one row must not
                  // freeze the others.
                  disabled={busyId === s.id || busyId === "all"}
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
                className={`${cardClass("inset")} flex items-center justify-between gap-3 text-sm`}
              >
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight text-foreground">
                    {supporterNameOf(s)}
                    {s.supporterType === "user" && (
                      <Badge tone="info" className="ml-2">
                        Donación personal
                      </Badge>
                    )}
                  </p>
                  {/* Subscriptions are always CRC (SUBSCRIPTION_UNIT_CRC) — keep formatColones,
                      do not swap to formatMoney. */}
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

      <ConfirmDialog
        open={confirmAllOpen}
        title="Confirmar todos los apoyos pendientes"
        confirmLabel="Confirmar todos"
        onConfirm={() => {
          setConfirmAllOpen(false);
          void confirmAll();
        }}
        onCancel={() => setConfirmAllOpen(false)}
      >
        Vas a confirmar los {pending.length} apoyos pendientes. Esta acción no se
        puede deshacer.
      </ConfirmDialog>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
