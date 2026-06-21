"use client";

/**
 * The "Bingo en pausa" notice players see while the director takes a break. Shows the reason (if
 * any) and, when the director announced a duration, a live MM:SS countdown from the pause's server
 * `startedAt`. Once the countdown hits zero — or when no duration was given — it reads "reiniciamos
 * en cualquier momento". Read-only: the school clears the pause from its console.
 *
 * Date.now() runs only in the effect/initializer (client), and the callers render this component
 * only after their client-side state has loaded, so there's no SSR/hydration mismatch.
 */
import { useEffect, useState } from "react";
import type { BingoPause } from "@/types";

function formatMMSS(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BingoPauseNotice({ pause }: { pause: BingoPause }) {
  const reason = pause.reason?.trim() || null;
  const startedMs = pause.startedAt?.toMillis?.() ?? 0;
  const endMs =
    pause.minutes != null && pause.minutes > 0 && startedMs
      ? startedMs + pause.minutes * 60_000
      : null;

  // The live clock lives in state (seeded once, refreshed each second by the interval) so the render
  // stays pure — no Date.now() during render, and the only setState is inside the interval callback.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endMs]);

  const remainingMs = endMs == null ? null : Math.max(0, endMs - now);
  const countingDown = remainingMs != null && remainingMs > 0;

  return (
    <div
      role="status"
      className="rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200"
    >
      <p className="text-base font-semibold">
        ⏸️ Bingo en pausa{reason ? ` por ${reason}` : ""}.
      </p>
      <p className="mt-1 text-sm">
        {countingDown ? (
          <>
            Volvemos en{" "}
            <span className="font-semibold tabular-nums">
              {formatMMSS(remainingMs!)}
            </span>
            .
          </>
        ) : (
          "Reiniciamos en cualquier momento."
        )}
      </p>
    </div>
  );
}
