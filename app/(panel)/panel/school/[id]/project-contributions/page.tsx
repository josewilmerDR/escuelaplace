"use client";

/**
 * Project contribution confirmation queue (/panel/school/[id]/project-contributions).
 *
 * Mirrors the subscription queue: the board reviews pending contributions to its projects
 * and confirms the ones whose payment proof matches what it received. Confirming a
 * contribution fires a Cloud Function that advances the project's progress bar. The board
 * can confirm one at a time or all pending at once.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartIcon } from "@/components/ui/icons";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import {
  confirmContribution,
  getContributionProofUrl,
  getContributionsBySchool,
  getSchoolById,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type { ProjectContributionDoc, SchoolDoc } from "@/types";

/** Lifecycle of the initial school + contributions fetch. */
type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando aportes…";

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
        Confirmar aportes a proyectos
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

export default function ProjectContributionsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [contribs, setContribs] = useState<ProjectContributionDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Accessible-only success feedback, announced via an aria-live region (no visual banner).
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(
    () => getContributionsBySchool(id).then(setContribs),
    [id],
  );

  // Initial load: on a Firestore failure land on "error" (Reintentar) instead of
  // a null school, so a transient network blip doesn't read as "Escuela no encontrada".
  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getContributionsBySchool(id)])
      .then(([s, c]) => {
        setSchool(s);
        setContribs(c);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  // Split the queue once per data change instead of on every render.
  const pending = useMemo(
    () => contribs.filter((c) => c.status === "pending"),
    [contribs],
  );
  const others = useMemo(
    () => contribs.filter((c) => c.status !== "pending"),
    [contribs],
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
          No pudimos cargar los aportes. Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school)
    return <p className="text-sm text-muted">Escuela no encontrada.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");
  if (!isManager) {
    return <p className="text-sm text-error">No administrás esta escuela.</p>;
  }

  const confirmOne = async (cid: string) => {
    if (!user) return;
    setBusyId(cid);
    setError(null);
    setStatus(null);
    try {
      await confirmContribution(cid, user.id);
      await reload();
      setStatus("Aporte confirmado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmAll = async () => {
    if (!user || pending.length === 0) return;
    // Bulk confirm is irreversible: guard with an explicit count before proceeding.
    if (
      !window.confirm(
        `¿Confirmar los ${pending.length} aportes pendientes? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setBusyId("all");
    setError(null);
    setStatus(null);
    const total = pending.length;
    try {
      // allSettled (not all): one failed confirm must not block the others, and we always
      // reload so successfully-confirmed rows disappear even on a partial failure.
      const results = await Promise.allSettled(
        pending.map((c) => confirmContribution(c.id, user.id)),
      );
      await reload();
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setError(`No se pudieron confirmar ${failed} de ${total} aportes.`);
      } else {
        setStatus(`${total} aportes confirmados.`);
      }
    } catch (err) {
      // reload() itself failed — the confirms may still have gone through.
      setError(err instanceof Error ? err.message : "No se pudieron confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (cid: string) => {
    setError(null);
    const url = await getContributionProofUrl(cid);
    if (!url) {
      setError("No se pudo abrir el comprobante.");
      return;
    }
    // A blocked popup returns null too — surface the same error so the click isn't silent.
    const win = window.open(url, "_blank", "noopener");
    if (!win) setError("No se pudo abrir el comprobante.");
  };

  // Nothing at all: pending AND history both empty.
  if (contribs.length === 0) {
    return (
      <main>
        <Heading subtitle={school.name} />
        <div className="mt-8">
          <EmptyState
            icon={<HeartIcon className="h-7 w-7" />}
            title="Todavía no hay aportes a tus proyectos"
            description="Cuando alguien aporte a uno de tus proyectos, su contribución aparecerá acá para que la confirmes."
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

      <SchoolPanelNav schoolId={id} current="project-contributions" />

      {/* Accessible-only success announcement; no visual banner is needed. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

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
          <p className="mt-2 text-sm text-muted">No hay aportes pendientes.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {pending.map((c) => (
              // Elevated calm-depth row per pending contribution, with its own primary confirm.
              <li
                key={c.id}
                className={`${cardClass("elevated")} flex items-center justify-between gap-3 text-sm`}
              >
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight text-foreground">
                    {c.donorName}
                    {c.type === "in_kind" && (
                      <Badge tone="info" className="ml-2">
                        En especie
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted">
                    {c.projectTitle} ·{" "}
                    {c.type === "in_kind" ? "valor estimado " : ""}
                    {formatMoney(c.amount, c.currency)}
                  </p>
                  {c.type === "in_kind" && (
                    <p className="text-xs text-muted">
                      {c.stageTitle ? `Cubre: ${c.stageTitle}. ` : ""}
                      {c.description}
                    </p>
                  )}
                  {c.proofUploaded ? (
                    <button
                      type="button"
                      onClick={() => viewProof(c.id)}
                      // Always-underlined + min tap height: hover:underline is invisible on touch.
                      className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-brand-darker underline"
                    >
                      Ver {c.type === "in_kind" ? "evidencia" : "comprobante"}
                    </button>
                  ) : (
                    <span className="mt-1 block text-xs text-muted">
                      Sin {c.type === "in_kind" ? "evidencia" : "comprobante"}
                    </span>
                  )}
                  {/* How long this contribution has waited — amber once it's stale, so an old
                      queue is visible at a glance. */}
                  <PendingAge since={c.createdAt} />
                </div>
                <button
                  type="button"
                  onClick={() => confirmOne(c.id)}
                  // Only this row (or a bulk run) disables it — confirming one row must not
                  // freeze the others.
                  disabled={busyId === c.id || busyId === "all"}
                  className="btn btn-primary shrink-0"
                >
                  {busyId === c.id ? "Confirmando…" : "Confirmar"}
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
            {others.map((c) => (
              // History is settled: a quieter inset panel, no primary action.
              <li
                key={c.id}
                className={`${cardClass("inset")} flex items-center justify-between gap-3 text-sm`}
              >
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight text-foreground">
                    {c.donorName}
                    {c.type === "in_kind" && (
                      <Badge tone="info" className="ml-2">
                        En especie
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted">
                    {c.projectTitle} ·{" "}
                    {c.type === "in_kind" ? "valor estimado " : ""}
                    {formatMoney(c.amount, c.currency)}
                  </p>
                </div>
                {/* Contributions are only pending|confirmed, so history is always confirmed. */}
                <Badge tone="success">Confirmado</Badge>
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
