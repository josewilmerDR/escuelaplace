"use client";

/**
 * The live-event slice of the PUBLIC bingo page. The detail page is SSR, but the called-numbers
 * board must stream, so this small client island subscribes to the event state and shows the board
 * while the game is live (and a "jugar" entry into the play view). When nothing is running it stays
 * quiet. Anyone can watch; only a buyer with assigned cartones can actually play (the play view
 * gates that). Read-only — the school drives the board from its console.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BingoCalledBoard } from "@/components/tools/BingoCalledBoard";
import { BingoPatternPreview } from "@/components/tools/BingoPatternPreview";
import { cardClass } from "@/components/ui/Card";
import { subscribeBingoEventState } from "@/lib/firestore";
import type { BingoEventState } from "@/types";

export function BingoLivePublic({
  schoolId,
  toolId,
  poolMin,
  poolMax,
}: {
  schoolId: string;
  toolId: string;
  poolMin: number;
  poolMax: number;
}) {
  const [state, setState] = useState<BingoEventState | null>(null);

  useEffect(
    () => subscribeBingoEventState(schoolId, toolId, setState),
    [schoolId, toolId],
  );

  const called = useMemo(
    () => new Set(state?.calledNumbers ?? []),
    [state?.calledNumbers],
  );
  const status = state?.status ?? "idle";
  const lastCalled = state?.calledNumbers?.at(-1);
  const activePattern = state?.activePattern ?? null;
  // Public round-status signals (the console maintains them): the prize this round plays for, whether
  // a "¡Bingo!" is under review, and the confirmed winner — by CARTÓN LABEL only, never a name.
  const activePrize = state?.activePrize ?? null;
  const reviewing = state?.reviewing ?? false;
  const winner = state?.winner ?? null;
  const playHref = `/panel/bingo-play?schoolId=${schoolId}&toolId=${toolId}`;

  if (status === "idle") return null; // nothing to show until the school starts

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {status === "live" ? "Bingo en vivo" : "El bingo finalizó"}
        </h2>
        {status === "live" && (
          <Link href={playHref} className="btn btn-primary">
            Jugar mis cartones
          </Link>
        )}
      </div>

      {status === "live" && activePattern && (
        <div className={`mt-3 ${cardClass("inset")}`}>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Forma de ganar esta ronda: {activePattern.name}
          </h3>
          {activePrize && (
            <p className="mt-1 text-sm">
              <span className="text-muted">Premio:</span>{" "}
              <span className="font-medium text-foreground">{activePrize.label}</span>
              {activePrize.isGrand && (
                <span className="text-muted"> · premio mayor</span>
              )}
            </p>
          )}
          <div className="mt-3">
            <BingoPatternPreview
              cells={activePattern.preview}
              caption={activePattern.caption}
              ariaLabel={activePattern.name}
            />
          </div>
        </div>
      )}

      {/* Round status, by cartón label only (never a name). */}
      {status === "live" && winner ? (
        <p className="mt-3 rounded-xl bg-success-tint p-3 text-sm font-medium text-success ring-1 ring-success/10">
          {winner.isGrand
            ? `🏆 ¡El cartón #${winner.cardLabel} ganó el premio mayor! El bingo terminó.`
            : `🎉 ¡Ganó el cartón #${winner.cardLabel}${winner.prizeLabel ? ` — ${winner.prizeLabel}` : ""}!`}
        </p>
      ) : status === "live" && reviewing ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          🔔 Alguien cantó «¡Bingo!» — la escuela está revisando.
        </p>
      ) : null}

      {status === "live" ? (
        <div className={`mt-3 ${cardClass("inset")}`}>
          <p className="text-xs text-muted">
            {called.size} cantados
            {lastCalled != null && (
              <>
                {" · "}último:{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {String(lastCalled).padStart(String(poolMax).length, "0")}
                </span>
              </>
            )}
          </p>
          <div className="mt-3">
            <BingoCalledBoard
              poolMin={poolMin}
              poolMax={poolMax}
              called={called}
              lastCalled={lastCalled}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          {winner?.isGrand
            ? `🏆 El bingo terminó: el premio mayor lo ganó el cartón #${winner.cardLabel}. ¡Gracias por participar!`
            : "El bingo terminó. ¡Gracias por participar!"}
        </p>
      )}
    </div>
  );
}
