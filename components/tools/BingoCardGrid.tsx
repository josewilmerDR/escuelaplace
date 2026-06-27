import Image from "next/image";
import { gridCenterIndex } from "@/lib/bingo-patterns";
import { BINGO_FREE_CENTER, type BingoCenterSquare } from "@/types";

/**
 * The classic 5×5 free-space center ("casilla central"), rendered as an already-covered cell: an
 * uploaded logo on white, a short label, or a solid blank. It is never a number and never tappable —
 * it auto-counts as marked. Shared by the card grid and the config form's preview so both look alike.
 */
export function BingoCenterCell({
  centerSquare,
}: {
  centerSquare: BingoCenterSquare;
}) {
  const base =
    "relative flex aspect-square items-center justify-center overflow-hidden rounded-md ring-1";
  if (centerSquare.type === "image" && centerSquare.imageUrl) {
    return (
      <span
        className={`${base} bg-white ring-brand`}
        role="img"
        aria-label="Casilla central libre"
      >
        <Image
          src={centerSquare.imageUrl}
          alt=""
          fill
          sizes="64px"
          className="object-contain p-0.5"
        />
      </span>
    );
  }
  if (centerSquare.type === "text" && centerSquare.text) {
    return (
      <span
        // text-[8px]/leading-none + hyphens keep a long label legible even in the small (~41px)
        // live-console card; break-words wraps a single long word rather than overflowing.
        className={`${base} hyphens-auto break-words bg-brand-darker px-0.5 text-center text-[8px] font-bold uppercase leading-none text-white ring-brand-darker`}
        role="img"
        aria-label="Casilla central libre"
      >
        {centerSquare.text}
      </span>
    );
  }
  // Blank (or image/text with no content yet) → a solid covered free cell.
  return (
    <span
      className={`${base} bg-brand-darker ring-brand-darker`}
      role="img"
      aria-label="Casilla central libre"
    />
  );
}

/**
 * A single bingo cartón rendered as a grid. Reused by the edit-page lote manager, the public bingo
 * page, and the live play view — where `marked` highlights the numbers the player has tapped. Pass
 * `onToggle` to make cells interactive (play): a cell is tappable only if its number is in
 * `markable`. The caller decides that set: in easy mode it's the called numbers (so a marked
 * pattern is always legitimate); in traditional mode it's every cell, so the player marks by hand
 * and may err. `numbers` is row-major; `cols` sets the grid width.
 *
 * `centerSquare` (classic 5×5 only) replaces the middle cell with a free space (logo/text/blank): it
 * renders the custom content, is never tappable, and is excluded from the number-based marking — the
 * win check treats it as auto-covered (see maskSatisfied's freeIndices). A free cell is detected
 * either from the card itself (a BINGO_FREE_CENTER sentinel in `numbers`, the deck-level model) or
 * from `centerSquare` + the middle index (legacy bingos whose center number is overridden).
 */
export function BingoCardGrid({
  label,
  numbers,
  cols,
  marked,
  markable,
  onToggle,
  centerSquare,
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
  /** Classic 5×5 free-space center; when set, the middle cell shows this instead of a number. */
  centerSquare?: BingoCenterSquare;
}) {
  const pad = numbers.length
    ? String(Math.max(...numbers)).length
    : 2;
  const rows = cols > 0 ? numbers.length / cols : 0;
  const centerIdx = centerSquare ? gridCenterIndex(rows, cols) : null;
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
          // The free center: a sentinel cell (deck-level model) or the configured middle cell (a
          // legacy bingo whose real center number is overridden). Falls back to a blank free cell
          // when no display config reached this render site.
          if (n === BINGO_FREE_CENTER || (centerSquare != null && i === centerIdx)) {
            return (
              <BingoCenterCell
                key={i}
                centerSquare={centerSquare ?? { type: "blank" }}
              />
            );
          }
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
