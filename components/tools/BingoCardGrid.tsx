/**
 * A single bingo cartón rendered as a grid. Reused by the edit-page lote manager, the public bingo
 * page, and the live play view — where `marked` highlights the numbers the player has tapped. Pass
 * `onToggle` to make cells interactive (play): a cell is tappable only if its number is in
 * `markable`. The caller decides that set: in easy mode it's the called numbers (so a marked
 * pattern is always legitimate); in traditional mode it's every cell, so the player marks by hand
 * and may err. `numbers` is row-major; `cols` sets the grid width.
 */
export function BingoCardGrid({
  label,
  numbers,
  cols,
  marked,
  markable,
  onToggle,
}: {
  /** Optional cartón serial shown above the grid. */
  label?: string;
  numbers: number[];
  cols: number;
  /** Numbers to render as marked; omitted = none marked. */
  marked?: Set<number>;
  /** Numbers the player is allowed to mark (easy mode: the called set; traditional: every cell).
   * Required for interactivity. */
  markable?: Set<number>;
  /** Play mode: toggle a cell's mark. A cell only fires when its number is in `markable`. */
  onToggle?: (n: number) => void;
}) {
  const pad = numbers.length
    ? String(Math.max(...numbers)).length
    : 2;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <p className="text-xs font-medium tabular-nums text-muted">#{label}</p>
      )}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {numbers.map((n, i) => {
          const isMarked = marked?.has(n) ?? false;
          const canMark = onToggle != null && (markable?.has(n) ?? false);
          const cls = `flex aspect-square items-center justify-center rounded-md text-xs font-semibold tabular-nums ring-1 ${
            isMarked
              ? "bg-brand-darker text-white ring-brand-darker"
              : "bg-surface text-foreground ring-black/5"
          }`;
          const value = String(n).padStart(pad, "0");
          return onToggle ? (
            <button
              key={i}
              type="button"
              onClick={() => onToggle(n)}
              disabled={!canMark && !isMarked}
              aria-pressed={isMarked}
              className={`${cls} ${canMark || isMarked ? "hover:opacity-90" : "cursor-not-allowed opacity-60"}`}
            >
              {value}
            </button>
          ) : (
            <span key={i} className={cls}>
              {value}
            </span>
          );
        })}
      </div>
    </div>
  );
}
