/**
 * The shared visual aid for a bingo winning shape: the fixed 5×5 grid (indices 0..24, row-major)
 * with the pattern's cells highlighted. It is NOT a cartón — it has no numbers, just the abstract
 * SHAPE — so it reads as "how to win". One implementation, five call sites: the pattern-picker
 * tiles, the custom-draw surface, the player's "cómo ganar" card, the public "forma de ganar" guide
 * and the console's "en juego" panel.
 *
 * READ mode (default) renders spans from a PRECOMPUTED `cells` mask — it never re-derives geometry,
 * so the aid can't drift from the anti-cheat truth. EDIT mode (`editable`) renders toggle buttons
 * over a caller-owned Set. SSR-safe: no hooks, and click handlers exist only in edit mode (which is
 * only used inside client components).
 */
import { BINGO_GRID_CELLS } from "@/types";

// EXPLICIT widths (w-*, not max-w-*). A grid of aspect-square / minmax(0,1fr) cells has ~0
// max-content width, so a max-width-only grid COLLAPSES inside any shrink-to-fit container — a
// wrapping button (the player's thumbnail), a column-centered flex (a modal). A fixed width renders
// the same no matter how the grid is wrapped or centered. Every call site's container is wider than
// its size, so these never overflow. (rem values match the old max-w sizes, so working row layouts
// look identical.)
const SIZE_CLASS = {
  xs: "w-16", // 4rem — a tiny thumbnail (e.g. the player's tappable "cómo ganar" hint)
  sm: "w-24", // 6rem — picker tiles, public/console inline guides
  md: "w-44", // 11rem — the custom-draw surface
  lg: "w-56", // 14rem — the enlarged "ver en grande" modal; fits even a narrow phone modal body
} as const;

export function BingoPatternPreview({
  cells,
  size = "sm",
  caption,
  editable = false,
  value,
  onToggle,
  ariaLabel,
}: {
  /** Cell indices (0..24) to highlight in READ mode. */
  cells?: number[];
  size?: "xs" | "sm" | "md" | "lg";
  /** Spanish helper rendered under the grid (for "any-of" families like línea/diagonal). */
  caption?: string;
  editable?: boolean;
  /** EDIT mode: the toggled cell set, owned by the parent. */
  value?: Set<number>;
  /** EDIT mode: toggle a cell. */
  onToggle?: (i: number) => void;
  ariaLabel?: string;
}) {
  const mask = new Set(cells ?? []);
  const isOn = (i: number) => (editable ? (value?.has(i) ?? false) : mask.has(i));
  return (
    <div>
      <div
        className={`grid grid-cols-5 gap-0.5 ${SIZE_CLASS[size]}`}
        {...(editable ? {} : { role: "img", "aria-label": ariaLabel })}
      >
        {Array.from({ length: BINGO_GRID_CELLS }, (_, i) => {
          const on = isOn(i);
          const cls = `aspect-square rounded-[3px] ring-1 ${
            on ? "bg-brand-darker ring-brand-darker" : "bg-surface ring-black/5"
          }`;
          return editable ? (
            <button
              key={i}
              type="button"
              onClick={() => onToggle?.(i)}
              aria-pressed={on}
              aria-label={`Casilla ${i + 1}`}
              className={`${cls} transition-colors hover:opacity-80`}
            />
          ) : (
            <span key={i} aria-hidden className={cls} />
          );
        })}
      </div>
      {caption && <p className="mt-1 text-xs text-muted">{caption}</p>}
    </div>
  );
}
