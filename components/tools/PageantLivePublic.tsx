"use client";

/**
 * The live-coronación slice of the PUBLIC reinado page. The detail page is SSR, but the gala streams,
 * so this small client island subscribes to the event state and surfaces it: a phase chip while it
 * runs, the SUGGESTED standings once the school reveals them, and the crown banner once the school
 * ratifies a winner. When nothing is running (no event doc, still in registration with nothing shown)
 * it stays quiet. Read-only — the school drives the gala from its console; the platform NEVER
 * auto-crowns (the standings are pageantStandings' non-binding suggestion).
 */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { CrownIcon } from "@/components/ui/icons";
import { pageantStandings, subscribePageantEventState } from "@/lib/firestore";
import type { CandidateDoc, PageantConfig, PageantEventState } from "@/types";

const PHASE_LABEL: Record<PageantEventState["phase"], string> = {
  registration: "Inscripciones abiertas",
  voting: "Votación en curso",
  gala: "Gala en vivo",
  closed: "Reinado finalizado",
};

export function PageantLivePublic({
  schoolId,
  toolId,
  candidates,
  config,
  year,
}: {
  schoolId: string;
  toolId: string;
  candidates: CandidateDoc[];
  /** Only the bits pageantStandings needs — keeps the config's Timestamps off the client boundary. */
  config: Pick<PageantConfig, "crownFormula" | "freeVotingEnabled">;
  /** The reinado's year (from the voting window), for the hall-of-fame crown banner. */
  year?: number;
}) {
  const [state, setState] = useState<PageantEventState | null>(null);
  useEffect(
    () => subscribePageantEventState(schoolId, toolId, setState),
    [schoolId, toolId],
  );

  const byId = useMemo(
    () => new Map(candidates.map((c) => [c.id, c] as const)),
    [candidates],
  );
  const standings = useMemo(
    () => pageantStandings(config, candidates),
    [config, candidates],
  );

  if (!state) return null; // nothing until the school opens the live event

  const { phase, revealed } = state;
  const winnerId = state.winnerCandidateId ?? null;
  const runnerUpId = state.runnerUpCandidateId ?? null;
  const winner = winnerId ? byId.get(winnerId) : undefined;
  const runnerUp = runnerUpId ? byId.get(runnerUpId) : undefined;
  const showStandings = revealed && standings.length > 0;

  // Registration with nothing revealed/crowned adds nothing over the roster below — stay quiet.
  if (phase === "registration" && !winner && !showStandings) return null;

  const galaOrClosed = phase === "gala" || phase === "closed";

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Badge tone={phase === "closed" ? "neutral" : "success"} className="gap-1">
          {galaOrClosed && <CrownIcon className="h-3.5 w-3.5" />}
          {PHASE_LABEL[phase]}
        </Badge>
      </div>

      {winner && (
        <div className="mt-3 rounded-2xl bg-brand-tint p-5 text-center ring-1 ring-brand/10">
          <CrownIcon className="mx-auto h-8 w-8 text-brand-darker" />
          <p className="mt-2 text-lg font-semibold tracking-tight text-brand-darker">
            ¡Felicidades, {winner.name}!
          </p>
          <p className="mt-1 text-sm text-muted">
            Corona del reinado{year ? ` ${year}` : ""}
          </p>
          {runnerUp && (
            <p className="mt-1 text-sm text-muted">
              2.º lugar:{" "}
              <span className="font-medium text-foreground">{runnerUp.name}</span>
            </p>
          )}
        </div>
      )}

      {showStandings && (
        <div className={`mt-3 ${cardClass("inset")}`}>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Posiciones {phase === "closed" ? "finales" : "en vivo"}
          </h3>
          <p className="mt-1 text-xs text-muted">
            Sugerencia de la comunidad; la corona la decide la escuela.
          </p>
          <ol className="mt-3 flex flex-col gap-2">
            {standings.map((s, i) => {
              const c = byId.get(s.candidateId);
              const isWinner = winnerId === s.candidateId;
              const isRunnerUp = runnerUpId === s.candidateId;
              return (
                <li key={s.candidateId} className="flex items-center gap-3 text-sm">
                  <span className="w-5 shrink-0 tabular-nums text-muted">{i + 1}.</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {c?.name ?? "—"}
                    </span>
                    {isWinner && (
                      <Badge tone="success" className="gap-1">
                        <CrownIcon className="h-3 w-3" />
                        Corona
                      </Badge>
                    )}
                    {isRunnerUp && <Badge tone="neutral">2°</Badge>}
                  </span>
                  <span
                    className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-brand-tint"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${Math.round(s.composite)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
