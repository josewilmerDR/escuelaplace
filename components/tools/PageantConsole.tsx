"use client";

/**
 * The reinado LIVE coronación console — the school drives the gala here.
 *
 * Drive the phase (inscripciones → votación → gala → cerrado), follow the SUGGESTED standings in
 * real time, decide whether to reveal them to the public ("retransmitir en vivo"), and crown the
 * winner. The standings are pageantStandings' non-binding suggestion (jury + support + sympathy,
 * weighted); the school RATIFIES by hand — the platform NEVER auto-crowns. No money changes hands
 * here; this is just the stage.
 *
 * Shared chrome: embedded by the per-reinado management page
 * (tools/[toolId]/manage). The container owns the page title; this renders the live controls only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { CrownIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import {
  pageantStandings,
  revealPageantStandings,
  setPageantPhase,
  setPageantWinner,
  subscribeCandidates,
  subscribePageantEventState,
  toolConfigOf,
} from "@/lib/firestore";
import type {
  CandidateDoc,
  PageantEventState,
  PageantPhase,
  ToolDoc,
} from "@/types";

/** The live phases in order, with the director's button label and a short hint. */
const PHASES: { key: PageantPhase; label: string; hint: string }[] = [
  { key: "registration", label: "Inscripciones", hint: "Candidaturas abiertas" },
  { key: "voting", label: "Votación", hint: "Simpatía y apoyo abiertos" },
  { key: "gala", label: "Gala", hint: "Revelar posiciones y coronar" },
  { key: "closed", label: "Cerrado", hint: "El reinado terminó" },
];

export function PageantConsole({
  schoolId,
  tool,
}: {
  schoolId: string;
  tool: ToolDoc;
}) {
  const pageant = toolConfigOf(tool, "pageant")!;
  const toolId = tool.id;

  const [state, setState] = useState<PageantEventState | null>(null);
  const [candidates, setCandidates] = useState<CandidateDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous in-flight lock so a fast double-tap can't fire an action twice before `busy` lands.
  const inFlight = useRef(false);

  // Live event state — the console + the public gala watch the same doc.
  useEffect(
    () => subscribePageantEventState(schoolId, toolId, setState),
    [schoolId, toolId],
  );
  // The roster, LIVE: as the Cloud Function moves the tallies (confirmed apoyo/simpatía) the
  // suggested standings refresh on their own, so the director follows the votes in real time.
  useEffect(
    () => subscribeCandidates(schoolId, toolId, setCandidates),
    [schoolId, toolId],
  );

  const byId = useMemo(
    () => new Map(candidates.map((c) => [c.id, c] as const)),
    [candidates],
  );
  const standings = useMemo(
    () => pageantStandings(pageant, candidates),
    [pageant, candidates],
  );

  const phase = state?.phase ?? null;
  const revealed = state?.revealed ?? false;
  const winnerId = state?.winnerCandidateId ?? null;
  const runnerUpId = state?.runnerUpCandidateId ?? null;

  const run = useCallback(async (op: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo completar la acción."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  // Crown / un-crown / runner-up — always pass BOTH ids so setting one preserves the other, and a
  // candidate can't be both winner and runner-up at once.
  const crown = (cid: string) =>
    run(() =>
      setPageantWinner(schoolId, toolId, cid, runnerUpId === cid ? null : runnerUpId),
    );
  const makeRunnerUp = (cid: string) =>
    run(() =>
      setPageantWinner(
        schoolId,
        toolId,
        winnerId === cid ? null : winnerId,
        runnerUpId === cid ? null : cid, // re-tap clears the runner-up
      ),
    );
  const clearCrown = () =>
    run(() => setPageantWinner(schoolId, toolId, null, runnerUpId));

  const winnerName = winnerId ? byId.get(winnerId)?.name : undefined;

  return (
    <section className="flex flex-col gap-6">
      <p className="text-xs text-muted">
        Fase actual:{" "}
        <span className="font-medium text-foreground">
          {phase ? (PHASES.find((p) => p.key === phase)?.label ?? phase) : "sin iniciar"}
        </span>
      </p>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {/* Phase stepper — the director advances by hand; nothing happens automatically. */}
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Fase del reinado
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {PHASES.map((p) => {
            const active = phase === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => run(() => setPageantPhase(schoolId, toolId, p.key))}
                disabled={busy || active}
                aria-pressed={active}
                className={active ? "btn btn-primary" : "btn btn-outline"}
                title={p.hint}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* The crowned winner, once the school ratifies it. */}
      {winnerId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-tint p-4 ring-1 ring-brand/10">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-darker">
            <CrownIcon className="h-5 w-5" />
            Coronada/o: {winnerName ?? "—"}
          </p>
          <button
            type="button"
            onClick={clearCrown}
            disabled={busy}
            className="btn btn-outline shrink-0"
          >
            Quitar corona
          </button>
        </div>
      )}

      {/* Suggested standings + the reveal toggle. */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Posiciones sugeridas
          </h3>
          <button
            type="button"
            onClick={() => run(() => revealPageantStandings(schoolId, toolId, !revealed))}
            disabled={busy}
            className="btn btn-outline"
          >
            {revealed ? "Ocultar al público" : "Revelar al público"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Sugerencia (jurado + apoyo{pageant.freeVotingEnabled ? " + simpatía" : ""}); la
          corona la decide la escuela.
        </p>
        {!pageant.freeVotingEnabled && (
          <p className="mt-1 text-xs text-muted">
            La simpatía no pesa en esta corona: el voto libre está apagado.
          </p>
        )}

        {standings.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Aún no hay candidaturas. Agrégalas desde la edición del reinado.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-3">
            {standings.map((s, i) => {
              const c = byId.get(s.candidateId);
              const isWinner = winnerId === s.candidateId;
              const isRunnerUp = runnerUpId === s.candidateId;
              return (
                <li
                  key={s.candidateId}
                  className={cardClass("elevated", false) + " p-4"}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
                        <span className="tabular-nums text-muted">{i + 1}.</span>
                        {c?.name ?? "—"}
                        {isWinner && (
                          <Badge tone="success" className="gap-1">
                            <CrownIcon className="h-3.5 w-3.5" />
                            Corona
                          </Badge>
                        )}
                        {isRunnerUp && <Badge tone="neutral">2° lugar</Badge>}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Puntaje sugerido:{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {Math.round(s.composite)}
                        </span>{" "}
                        · J {Math.round(s.parts.jury)} · A {Math.round(s.parts.support)}
                        {pageant.freeVotingEnabled
                          ? ` · S ${Math.round(s.parts.sympathy)}`
                          : ""}
                      </p>
                      <div
                        className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-brand-tint"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.round(s.composite)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => (isWinner ? clearCrown() : crown(s.candidateId))}
                        disabled={busy}
                        className={isWinner ? "btn btn-outline" : "btn btn-primary"}
                      >
                        {isWinner ? "Quitar corona" : "Coronar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => makeRunnerUp(s.candidateId)}
                        disabled={busy || isWinner}
                        className="btn btn-outline"
                      >
                        {isRunnerUp ? "Quitar 2°" : "2° lugar"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="text-xs text-muted">
        La plataforma nunca corona automáticamente ni procesa dinero: solo muestra la
        sugerencia. El veredicto es de la escuela.
      </p>
    </section>
  );
}
