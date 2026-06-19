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
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type WriteBatch,
} from "firebase/firestore";
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
 * cell can hold a distinct number).
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
 * One cartón's numbers: rows*cols DISTINCT values from [poolMin, poolMax], row-major. Uses a
 * partial Fisher–Yates shuffle over the pool. The caller must validate the format first
 * (bingoFormatError) so the pool is big enough.
 */
export function randomCardNumbers(format: BingoFormat): number[] {
  const size = format.rows * format.cols;
  const pool: number[] = [];
  for (let n = format.poolMin; n <= format.poolMax; n++) pool.push(n);
  for (let i = 0; i < size && i < pool.length; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
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
    return { ok: false, error: "Pegá al menos un cartón (uno por línea)." };
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
    for (const t of tokens) {
      const n = Number(t);
      if (!Number.isInteger(n) || n < format.poolMin || n > format.poolMax) {
        return {
          ok: false,
          error: `La línea ${i + 1} tiene un valor fuera de rango (${format.poolMin}–${format.poolMax}): «${t}».`,
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

/** Every cartón of a bingo, ordered by label (numeric-aware). Public read. */
export const getBingoCards = cache(
  async (schoolId: string, toolId: string): Promise<BingoCardDoc[]> => {
    const snap = await getDocs(cardsCol(schoolId, toolId));
    return snapToList<BingoCard>(snap).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  },
);

// ── Writes (school owner/editor/admin only — enforced by rules) ────────────────

const BATCH_LIMIT = 450; // < Firestore's 500-op ceiling, with headroom.

/** Commit a list of batch operations in chunks under Firestore's per-batch limit. */
async function commitInChunks(ops: ((batch: WriteBatch) => void)[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

/**
 * Generate `count` cartones with random distinct numbers, labelled sequentially from
 * `startNumber`, zero-padded to a FIXED width so every batch's serials line up (and never collide
 * across batches). The caller passes startNumber = (highest existing serial) + 1 — see
 * nextCardStartNumber — so a delete-then-generate can't reuse a live serial. Validate the format
 * first.
 */
export async function generateBingoCards(
  schoolId: string,
  toolId: string,
  format: BingoFormat,
  count: number,
  startNumber = 1,
): Promise<void> {
  // Fixed width across batches (cap is BINGO_CARD_MAX = 1000 → 3 digits covers 001–999; the 1000th
  // serial is just "1000"). padStart never truncates, so a larger number stays intact.
  const pad = 3;
  const col = cardsCol(schoolId, toolId);
  const ops = Array.from({ length: count }, (_, i) => (batch: WriteBatch) => {
    batch.set(doc(col), {
      label: String(startNumber + i).padStart(pad, "0"),
      numbers: randomCardNumbers(format),
      status: "available",
      createdAt: serverTimestamp(),
    });
  });
  await commitInChunks(ops);
}

/** Persist already-validated imported cartones (see parseImportedCards). */
export async function importBingoCards(
  schoolId: string,
  toolId: string,
  cards: ParsedBingoCard[],
): Promise<void> {
  const col = cardsCol(schoolId, toolId);
  const ops = cards.map((c) => (batch: WriteBatch) => {
    batch.set(doc(col), {
      label: c.label,
      numbers: c.numbers,
      status: "available",
      createdAt: serverTimestamp(),
    });
  });
  await commitInChunks(ops);
}

/** Delete one cartón (management). */
export async function deleteBingoCard(
  schoolId: string,
  toolId: string,
  cardId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId, CARDS, cardId));
}

/** Delete the whole lote (management). The caller should confirm + guard against clearing a lote
 * that already has sold cartones. */
export async function clearBingoCards(
  schoolId: string,
  toolId: string,
): Promise<void> {
  const snap = await getDocs(cardsCol(schoolId, toolId));
  const ops = snap.docs.map((d) => (batch: WriteBatch) => batch.delete(d.ref));
  await commitInChunks(ops);
}
