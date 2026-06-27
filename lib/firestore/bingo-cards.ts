/**
 * Typed reads + writes of a bingo's cartones (cards) — the subcollection
 * `schools/{schoolId}/tools/{toolId}/cards/{cardId}`. A cartón is a grid of distinct random
 * numbers; the lote is often 100+, hence a subcollection (the public tool doc stays light).
 *
 * Cards are written ONLY by the school (the numbers are integrity-critical — a buyer must never
 * be able to edit their cartón), so firestore.rules gate writes to the owner/editors/admin while
 * keeping reads public (the numbers are no secret; the player needs to see them). Assignment to a
 * buyer happens when the school confirms their order — see confirmBingoOrder in ./bingo-orders.
 *
 * The pure helpers (randomCardNumbers / parseImportedCards / bingoFormatError /
 * getBingoCardAvailability) carry the logic and are unit-tested.
 */
import { cache } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  BINGO_CARD_MAX,
  BINGO_GRID_MAX,
  BINGO_GRID_MIN,
  BINGO_LABEL_MAX,
  type BingoCard,
  type BingoCardDoc,
  type BingoFormat,
  type BingoOrderDoc,
} from "@/types";
import { snapToList } from "./converters";

const SCHOOLS = "schools";
const TOOLS = "tools";
const CARDS = "cards";

function cardsCol(schoolId: string, toolId: string) {
  return collection(db, SCHOOLS, schoolId, TOOLS, toolId, CARDS);
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

/**
 * Validate a card format. Returns a Spanish error message, or null when valid. A format is valid
 * when the grid is within bounds and the number pool is at least as large as the grid (so every
 * cell can hold a distinct number). Note: `poolSize >= rows*cols` also guarantees that the
 * even per-column split (see `columnRange`) leaves every column at least `rows` numbers, so a
 * column can always be filled with distinct values.
 */
export function bingoFormatError(format: BingoFormat): string | null {
  const { rows, cols, poolMin, poolMax } = format;
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < BINGO_GRID_MIN ||
    cols < BINGO_GRID_MIN ||
    rows > BINGO_GRID_MAX ||
    cols > BINGO_GRID_MAX
  ) {
    return `Las dimensiones deben ser enteros entre ${BINGO_GRID_MIN} y ${BINGO_GRID_MAX}.`;
  }
  if (
    !Number.isInteger(poolMin) ||
    !Number.isInteger(poolMax) ||
    poolMax < poolMin
  ) {
    return "El rango de números no es válido.";
  }
  const poolSize = poolMax - poolMin + 1;
  if (poolSize < rows * cols) {
    return `El rango (${poolSize} números) es menor que las casillas del cartón (${rows * cols}).`;
  }
  return null;
}

/**
 * The `[lo, hi]` (inclusive) number range that column `col` (0-based) draws from — the classic
 * B-I-N-G-O rule, where each column holds its own band of the pool (column 1 the lowest numbers,
 * the last column the highest). The pool `[poolMin, poolMax]` is split into `cols` contiguous
 * segments; any remainder is handed to the earliest columns. With the standard 5×5 / 0–75 bingo
 * this yields 0–15, 16–30, 31–45, 46–60, 61–75. Assumes a format that passed `bingoFormatError`.
 */
export function columnRange(format: BingoFormat, col: number): [number, number] {
  const poolSize = format.poolMax - format.poolMin + 1;
  const base = Math.floor(poolSize / format.cols);
  const remainder = poolSize % format.cols;
  // Earliest `remainder` columns get one extra number; `Math.min(col, remainder)` is how many of
  // those wider columns precede this one (their +1s shift this column's start up).
  const lo = format.poolMin + col * base + Math.min(col, remainder);
  const size = base + (col < remainder ? 1 : 0);
  return [lo, lo + size - 1];
}

/**
 * One cartón's numbers: each COLUMN holds `rows` DISTINCT values from its own range (see
 * `columnRange` — the B-I-N-G-O bands), laid out row-major (index = row*cols + col). Uses a partial
 * Fisher–Yates shuffle per column. The caller must validate the format first (bingoFormatError) so
 * every column band is big enough.
 */
export function randomCardNumbers(format: BingoFormat): number[] {
  const { rows, cols } = format;
  const numbers = new Array<number>(rows * cols);
  for (let col = 0; col < cols; col++) {
    const [lo, hi] = columnRange(format, col);
    const band: number[] = [];
    for (let n = lo; n <= hi; n++) band.push(n);
    for (let i = 0; i < rows && i < band.length; i++) {
      const j = i + Math.floor(Math.random() * (band.length - i));
      [band[i], band[j]] = [band[j], band[i]];
    }
    for (let row = 0; row < rows; row++) numbers[row * cols + col] = band[row];
  }
  return numbers;
}

export interface ParsedBingoCard {
  label: string;
  numbers: number[];
}

/**
 * Parse pasted/CSV cartones — one cartón per line. Each line is `rows*cols` numbers separated by
 * spaces/commas/semicolons, optionally prefixed by a label and a colon (e.g. "001: 5, 12, 33").
 * When no label is given, lines are numbered sequentially. Returns a Spanish error (with the line
 * number) on the first invalid line.
 */
export function parseImportedCards(
  text: string,
  format: BingoFormat,
):
  | { ok: true; cards: ParsedBingoCard[] }
  | { ok: false; error: string } {
  const size = format.rows * format.cols;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, error: "Pega al menos un cartón (uno por línea)." };
  }
  if (lines.length > BINGO_CARD_MAX) {
    return { ok: false, error: `Máximo ${BINGO_CARD_MAX} cartones por lote.` };
  }
  const cards: ParsedBingoCard[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let label = String(i + 1);
    let body = line;
    const colon = line.indexOf(":");
    if (colon >= 0) {
      label = line.slice(0, colon).trim() || String(i + 1);
      body = line.slice(colon + 1);
    }
    const tokens = body
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length !== size) {
      return {
        ok: false,
        error: `La línea ${i + 1} tiene ${tokens.length} números; se esperaban ${size}.`,
      };
    }
    const numbers: number[] = [];
    const seen = new Set<number>();
    for (let pos = 0; pos < tokens.length; pos++) {
      const t = tokens[pos];
      const n = Number(t);
      // Each cell must fall in ITS column's band (B-I-N-G-O), not just the whole pool — so an
      // imported cartón lines up with the generated ones. Column = position within the row.
      const col = pos % format.cols;
      const [lo, hi] = columnRange(format, col);
      if (!Number.isInteger(n) || n < lo || n > hi) {
        return {
          ok: false,
          error: `La línea ${i + 1}, columna ${col + 1}: «${t}» está fuera del rango de esa columna (${lo}–${hi}).`,
        };
      }
      if (seen.has(n)) {
        return { ok: false, error: `La línea ${i + 1} repite el número ${n}.` };
      }
      seen.add(n);
      numbers.push(n);
    }
    cards.push({ label: label.slice(0, BINGO_LABEL_MAX), numbers });
  }
  return { ok: true, cards };
}

/**
 * The next sequential serial for generation: one past the HIGHEST existing numeric label (not the
 * card count), so deleting a card and generating again never reuses a live serial. Non-numeric
 * (imported) labels are ignored for the max.
 */
export function nextCardStartNumber(
  cards: Pick<BingoCardDoc, "label">[],
): number {
  const maxNumeric = cards.reduce((max, c) => {
    const n = Number(c.label);
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
  return maxNumeric + 1;
}

export interface BingoAvailability {
  total: number;
  sold: number;
  pendingReserved: number;
  available: number;
}

/**
 * How many cartones are still buyable: total minus already-sold (assigned on a confirmed order)
 * minus the quantity reserved by still-pending orders. Mirrors how the raffle derives number
 * state from its orders. Never returns a negative `available`.
 */
export function getBingoCardAvailability(
  cards: Pick<BingoCardDoc, "status">[],
  orders: Pick<BingoOrderDoc, "status" | "quantity">[],
): BingoAvailability {
  const total = cards.length;
  const sold = cards.filter((c) => c.status === "sold").length;
  const pendingReserved = orders
    .filter((o) => o.status === "pending")
    .reduce((sum, o) => sum + (Number.isFinite(o.quantity) ? o.quantity : 0), 0);
  const available = Math.max(0, total - sold - pendingReserved);
  return { total, sold, pendingReserved, available };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Numeric-aware comparator for serial labels so "002" < "010" < "100" (not lexicographic). */
export function byCardLabel(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { numeric: true });
}

/** Every cartón of a bingo, ordered by label (numeric-aware). Public read. */
export const getBingoCards = cache(
  async (schoolId: string, toolId: string): Promise<BingoCardDoc[]> => {
    const snap = await getDocs(cardsCol(schoolId, toolId));
    return snapToList<BingoCard>(snap).sort(byCardLabel);
  },
);

/**
 * The cartones a buyer owns in a bingo (assigned on confirmation), ordered by label. Powers the
 * player's "mis cartones / jugar" view in the live event. Public read (the numbers are no secret),
 * but a buyer only ever queries their own uid.
 */
export async function getBingoCardsByOwner(
  schoolId: string,
  toolId: string,
  ownerId: string,
): Promise<BingoCardDoc[]> {
  const snap = await getDocs(
    query(cardsCol(schoolId, toolId), where("ownerId", "==", ownerId)),
  );
  return snapToList<BingoCard>(snap).sort(byCardLabel);
}

