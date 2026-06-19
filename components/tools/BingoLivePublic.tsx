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
          Esta ronda ya terminó. Gracias por participar.
        </p>
      )}
    </div>
  );
}
