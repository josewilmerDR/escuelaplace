/**
 * A single bingo cartón rendered as a grid (read-only). Reused by the edit-page lote manager,
 * the public bingo page, and (phase 2) the live play view — where `marked` highlights the numbers
 * the player has tapped. `numbers` is row-major; `cols` sets the grid width.
 */
export function BingoCardGrid({
  label,
  numbers,
  cols,
  marked,
}: {
  /** Optional cartón serial shown above the grid. */
  label?: string;
  numbers: number[];
  cols: number;
  /** Numbers to render as marked (phase-2 play); omitted = none marked. */
  marked?: Set<number>;
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
          return (
            <span
              key={i}
              className={`flex aspect-square items-center justify-center rounded-md text-xs font-semibold tabular-nums ring-1 ${
                isMarked
                  ? "bg-brand-darker text-white ring-brand-darker"
                  : "bg-surface text-foreground ring-black/5"
              }`}
            >
              {String(n).padStart(pad, "0")}
            </span>
          );
        })}
      </div>
    </div>
  );
}
