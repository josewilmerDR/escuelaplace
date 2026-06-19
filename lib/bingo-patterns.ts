/**
 * Pure bingo win-validation — the anti-cheat truth for the live event (Phase 2). A cartón's
 * `numbers` are row-major (length rows*cols); a "line" is a COMPLETE row, column or diagonal and
 * `full` is the whole cartón. A pattern is satisfied when SOME of its lines has every cell's
 * number present in a "hit set":
 *   - to ENABLE a player's "¡Bingo!" button, the hit set is the numbers they MANUALLY marked
 *     (which the UI only lets them mark once called) — a passive player never qualifies.
 *   - for the school to VALIDATE a claim, the hit set is the called numbers (the source of truth);
 *     the player's marks are irrelevant to the verdict, only what the tómbola actually drew.
 *
 * Diagonals only exist on a square grid (rows === cols); on a non-square cartón the diagonal
 * pattern yields no lines (it can never be won) — the config UI should not offer it there.
 *
 * No Firebase here — these are unit-tested helpers, mirrored in spirit by the board + play UIs.
 */
import type { BingoFormat, BingoPattern } from "@/types";

/**
 * The cell INDICES (into a row-major `numbers` array) of every line of `pattern` for a grid of
 * `format`. Each inner array is one potential winning line; a pattern is won when any one line is
 * fully covered. `full` is a single line covering all cells.
 */
export function winningLineIndices(
  format: Pick<BingoFormat, "rows" | "cols">,
  pattern: BingoPattern,
): number[][] {
  const { rows, cols } = format;
  if (rows <= 0 || cols <= 0) return [];

  switch (pattern) {
    case "row":
      return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => r * cols + c),
      );
    case "column":
      return Array.from({ length: cols }, (_, c) =>
        Array.from({ length: rows }, (_, r) => r * cols + c),
      );
    case "diagonal": {
      // Only meaningful on a square grid; otherwise there is no full-length diagonal.
      if (rows !== cols) return [];
      const main = Array.from({ length: rows }, (_, i) => i * cols + i);
      const anti = Array.from({ length: rows }, (_, i) => i * cols + (cols - 1 - i));
      return [main, anti];
    }
    case "full":
      return [Array.from({ length: rows * cols }, (_, i) => i)];
    default:
      return [];
  }
}

/**
 * Does the cartón satisfy `pattern` given the numbers in `hit`? True when at least one of the
 * pattern's lines has every cell's number contained in `hit`.
 */
export function cardSatisfiesPattern(
  numbers: number[],
  format: Pick<BingoFormat, "rows" | "cols">,
  pattern: BingoPattern,
  hit: Set<number>,
): boolean {
  const lines = winningLineIndices(format, pattern);
  return lines.some((line) =>
    line.every((idx) => {
      const n = numbers[idx];
      return n !== undefined && hit.has(n);
    }),
  );
}

/**
 * Which of the `enabled` patterns the cartón currently satisfies given `hit` — used by the play
 * view to decide which "¡Bingo!" buttons to light up, and by the board to show a claim's verdict.
 * Returns them in the order they appear in `enabled`.
 */
export function satisfiedPatterns(
  numbers: number[],
  format: Pick<BingoFormat, "rows" | "cols">,
  enabled: BingoPattern[],
  hit: Set<number>,
): BingoPattern[] {
  return enabled.filter((p) => cardSatisfiesPattern(numbers, format, p, hit));
}
