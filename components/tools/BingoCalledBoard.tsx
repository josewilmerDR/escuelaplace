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

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
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
            className={`${cls} hover:opacity-90 disabled:opacity-50`}
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
