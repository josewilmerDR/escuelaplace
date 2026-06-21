/**
 * The called bingo numbers as a single, horizontally-scrollable row (a carousel) — a compact
 * alternative to the full pool grid (BingoCalledBoard) for space-tight mobile views like the
 * player's "jugar" page. Shows ONLY the numbers that have actually been called, newest first: at
 * rest (scrolled to the start) the most recent call is the first chip, so a new call slides in at
 * the left edge; older calls scroll off to the right. Purely presentational — no Firebase, no hooks
 * — so it renders the same anywhere a read-only board does. The scroll region is keyboard-focusable
 * (arrow keys scroll it) and its scrollbar is hidden, matching the app's other carousels.
 */
export function BingoCalledStrip({
  called,
  pad,
}: {
  /** Called numbers in CALL ORDER (oldest → newest), exactly as stored on the event. */
  called: number[];
  /** Zero-pad width so every chip lines up (typically String(poolMax).length). */
  pad: number;
}) {
  if (called.length === 0) {
    return <p className="text-sm text-muted">Aún no se cantó ningún número.</p>;
  }

  // Newest first: the latest call sits at the left edge (visible without scrolling); older calls
  // extend to the right. The original array is in call order, so a copy-reverse gives newest→oldest.
  const ordered = [...called].reverse();

  return (
    // The horizontal scroll lives here. It's a focusable region (tabIndex + role + name) so a
    // keyboard-only user can arrow-scroll the overflow; `no-scrollbar` hides the bar (the cut-off
    // chips are the affordance, like the app's other carousels) and `overscroll-x-contain` stops a
    // flick at the ends from chaining to the page / browser back-gesture. `py-1` leaves room for the
    // emphasized chip's ring, the negative margin lets chips reach the card edge, and `w-max` makes
    // the inner row as wide as its content so it can overflow and scroll.
    <div
      role="group"
      aria-label="Números cantados, del más reciente al más antiguo"
      tabIndex={0}
      className="no-scrollbar -mx-1 overflow-x-auto overscroll-x-contain rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-darker/40"
    >
      <ul className="flex w-max items-center gap-1.5">
        {ordered.map((n, i) => {
          const isLast = i === 0; // the most recent call
          const label = String(n).padStart(pad, "0");
          return (
            <li key={n} className="shrink-0">
              <span
                // The amber ring marks the latest call visually; aria-label carries that same
                // "latest" meaning to assistive tech, so it isn't color-only.
                aria-label={isLast ? `último número cantado: ${label}` : undefined}
                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-sm font-semibold tabular-nums text-white ${
                  isLast
                    ? "bg-brand-darker ring-2 ring-amber-400"
                    : "bg-brand-darker ring-1 ring-brand-darker"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
