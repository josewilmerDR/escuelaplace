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
import { BINGO_GRID_CELLS } from "@/types";
import type {
  BingoActivePattern,
  BingoFormat,
  BingoPattern,
  PatternDef,
} from "@/types";

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
 * The generalized win predicate: does the cartón satisfy ANY of `arrangements` given the numbers in
 * `hit`? An arrangement is satisfied when every one of its cell indices holds a number contained in
 * `hit`. This is the single anti-cheat truth for both built-in and custom patterns (the per-round
 * pattern carries its arrangements as a frozen snapshot, so validation never reads the catalog).
 */
export function maskSatisfied(
  numbers: number[],
  arrangements: number[][],
  hit: Set<number>,
): boolean {
  return arrangements.some((line) =>
    line.every((idx) => {
      const n = numbers[idx];
      return n !== undefined && hit.has(n);
    }),
  );
}

// ── Built-in pattern catalog (fixed 5×5 grid, indices 0..24 row-major) ──────────
//
// The 10 "modalidades" the live director can pick per round. Geometry is generated from grid math
// where it's parametric (lines, double lines, diagonals) and pinned literally where it's a fixed
// silhouette (frames, letters, corners, windmill) — every value asserted in bingo-patterns.test.ts,
// because a single wrong index silently breaks the anti-cheat verdict. `preview` is the visual-aid
// mask; for "any-of" families it's one representative placement plus a Spanish caption.

const GRID = 5;

/** The 5 cell indices of a full row r. */
function fullRow(r: number): number[] {
  return [0, 1, 2, 3, 4].map((c) => r * GRID + c);
}
/** The 5 cell indices of a full column c. */
function fullCol(c: number): number[] {
  return [0, 1, 2, 3, 4].map((r) => r * GRID + c);
}
/** Every distinct UNORDERED pair of `lines`, each merged into a single arrangement. */
function linePairUnions(lines: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      out.push([...lines[i], ...lines[j]]);
    }
  }
  return out;
}

const ROWS = [0, 1, 2, 3, 4].map(fullRow);
const COLS = [0, 1, 2, 3, 4].map(fullCol);
const DIAG_MAIN = [0, 6, 12, 18, 24];
const DIAG_ANTI = [4, 8, 12, 16, 20];

/**
 * The ordered catalog of built-in patterns (the picker shows them in this order). Each is a
 * complete PatternDef on the fixed 5×5 grid. Custom patterns (kind 'custom') come from the school's
 * saved catalog and are NOT here.
 */
export const BINGO_BUILTIN_PATTERNS: PatternDef[] = [
  {
    id: "line",
    name: "Línea vertical u horizontal",
    kind: "builtin",
    // Any complete row OR any complete column (never a diagonal — that's its own modalidad).
    arrangements: [...ROWS, ...COLS],
    // L-shape: top row + left column, to read as "a full row or a full column".
    preview: [0, 1, 2, 3, 4, 5, 10, 15, 20],
    caption: "Cualquier fila o columna completa.",
  },
  {
    id: "diagonal",
    name: "Diagonal",
    kind: "builtin",
    arrangements: [DIAG_MAIN, DIAG_ANTI],
    preview: [0, 4, 6, 8, 12, 16, 18, 20, 24],
    caption: "Cualquiera de las dos diagonales.",
  },
  {
    id: "corners",
    name: "Cuatro esquinas",
    kind: "builtin",
    arrangements: [[0, 4, 20, 24]],
    preview: [0, 4, 20, 24],
  },
  {
    id: "frame_inner",
    name: "Marco interno",
    kind: "builtin",
    // The 3×3 inner ring, center (12) excluded (hollow).
    arrangements: [[6, 7, 8, 11, 13, 16, 17, 18]],
    preview: [6, 7, 8, 11, 13, 16, 17, 18],
  },
  {
    id: "frame_outer",
    name: "Marco externo",
    kind: "builtin",
    // The full outer border (16 cells).
    arrangements: [[0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]],
    preview: [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24],
  },
  {
    id: "full",
    name: "Cartón lleno",
    kind: "builtin",
    arrangements: [Array.from({ length: BINGO_GRID_CELLS }, (_, i) => i)],
    preview: Array.from({ length: BINGO_GRID_CELLS }, (_, i) => i),
  },
  {
    id: "letter_x",
    name: "Letra X",
    kind: "builtin",
    // BOTH diagonals at once (one shape, 9 distinct cells) — contrast "Diagonal" (either).
    arrangements: [[0, 4, 6, 8, 12, 16, 18, 20, 24]],
    preview: [0, 4, 6, 8, 12, 16, 18, 20, 24],
  },
  {
    id: "letter_h",
    name: "Letra H",
    kind: "builtin",
    // Left column + right column + the middle-row crossbar (13 cells).
    arrangements: [[0, 4, 5, 9, 10, 11, 12, 13, 14, 15, 19, 20, 24]],
    preview: [0, 4, 5, 9, 10, 11, 12, 13, 14, 15, 19, 20, 24],
  },
  {
    id: "double_line",
    name: "Doble línea vertical u horizontal",
    kind: "builtin",
    // Any two PARALLEL complete lines, same axis (10 row-pairs + 10 col-pairs); never a row+col mix.
    arrangements: [...linePairUnions(ROWS), ...linePairUnions(COLS)],
    // Two sample parallel rows.
    preview: [5, 6, 7, 8, 9, 15, 16, 17, 18, 19],
    caption: "Dos filas o dos columnas completas.",
  },
  {
    id: "pinwheel",
    name: "Molino de vientos",
    kind: "builtin",
    // Product-fixed pinwheel silhouette (rotationally symmetric, 9 cells).
    arrangements: [[2, 3, 5, 10, 12, 14, 19, 21, 22]],
    preview: [2, 3, 5, 10, 12, 14, 19, 21, 22],
  },
];

/** Built-ins keyed by id, for resolving a stored activePattern/claim back to its def. */
export const BINGO_BUILTIN_PATTERN_BY_ID: Record<string, PatternDef> =
  Object.fromEntries(BINGO_BUILTIN_PATTERNS.map((p) => [p.id, p]));

/**
 * Freeze a PatternDef into the per-round snapshot stored on the event state + every claim (a
 * PatternDef without `kind`). Used by the picker/draw when the director starts a round.
 */
export function toActivePattern(def: PatternDef): BingoActivePattern {
  return {
    id: def.id,
    name: def.name,
    arrangements: def.arrangements,
    preview: def.preview,
    ...(def.caption ? { caption: def.caption } : {}),
  };
}
