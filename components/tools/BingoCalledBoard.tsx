import type { CSSProperties } from "react";

/**
 * The pool of bingo numbers (poolMin..poolMax) as a grid, with the CALLED ones highlighted and the
 * last one emphasized. Read-only for watchers/players; pass `onCall` to make every cell a button
 * (the school's live console taps to call/recall a number). Purely presentational — no Firebase,
 * no hooks — so it renders the same on the public page, the play view and the board console.
 */
export function BingoCalledBoard({
  poolMin,
  poolMax,
  called,
  lastCalled,
  onCall,
  disabled = false,
}: {
  poolMin: number;
  poolMax: number;
  called: Set<number>;
  /** The most recently drawn number, ringed for emphasis. */
  lastCalled?: number;
  /** When present each cell is a toggle button (school console); omitted = read-only board. */
  onCall?: (n: number) => void;
  disabled?: boolean;
}) {
  const count = Math.max(0, poolMax - poolMin + 1);
  const numbers = Array.from({ length: count }, (_, i) => poolMin + i);
  const pad = String(poolMax).length;
  // A wide pool (0–99) reads best at 10 columns; a small one fits its own size.
  const cols = Math.min(10, Math.max(5, count));
  // Console cells are tap targets the director hits under pressure, so cap the columns harder
  // on a phone (≤6) — keeping each cell well above the 40px floor — then open up to the full
  // width from sm. Read-only cells aren't tappable, so they keep the dense single layout.
  const colsSm = onCall ? Math.min(6, cols) : cols;
  const gridClass = onCall
    ? "grid gap-1.5 grid-cols-[repeat(var(--cols-sm),minmax(0,1fr))] sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
    : "grid gap-1";
  const gridStyle = onCall
    ? ({ "--cols-sm": colsSm, "--cols": cols } as CSSProperties)
    : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  return (
    <div className={gridClass} style={gridStyle}>
      {numbers.map((n) => {
        const isCalled = called.has(n);
        const isLast = n === lastCalled;
        const cls = `flex aspect-square items-center justify-center rounded-md text-xs font-semibold tabular-nums ring-1 transition-colors ${
          isCalled
            ? "bg-brand-darker text-white ring-brand-darker"
            : "bg-surface text-muted ring-black/5"
        } ${isLast ? "ring-2 ring-offset-1 ring-amber-400" : ""}`;
        const label = String(n).padStart(pad, "0");
        return onCall ? (
          <button
            key={n}
            type="button"
            onClick={() => onCall(n)}
            disabled={disabled}
            aria-pressed={isCalled}
            className={`${cls} min-h-11 min-w-11 hover:opacity-90 disabled:opacity-50`}
          >
            {label}
          </button>
        ) : (
          <span key={n} className={cls} aria-hidden={!isCalled}>
            {label}
          </span>
        );
      })}
    </div>
  );
}
