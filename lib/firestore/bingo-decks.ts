/**
 * Typed reads + writes of a school's reusable bingo decks (mazos) — the catalog
 * schools/{schoolId}/bingoDecks/{deckId} plus its template cartones in the nested `cards`
 * subcollection. A deck is a lote the school saves ONCE (from the card manager) and reuses across
 * many bingos: creating a bingo from a deck COPIES its cartones into that tool's `cards` as fresh
 * `available` ones, so per-event sold/assignment state never collides between bingos.
 *
 * Everything here runs client-side from the panel — the create-page picker (getBingoDecks), the
 * copy into a new bingo (copyDeckToTool) and the save/delete writes. A deck is a BOARD-ONLY
 * convenience (nothing public references it — the public cartones are the copies on the tool), so
 * firestore.rules gate every access to the school's owner/editors/admin. Mirrors the custom-pattern
 * catalog (./bingo-patterns-catalog) and the tool-card writer (./bingo-cards).
 *
 * The pure helpers (deckCardsFromLote / bingoDeckNameError) carry the logic and are unit-tested.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  BINGO_DECK_NAME_MAX,
  type BingoCardDoc,
  type BingoDeck,
  type BingoDeckCard,
  type BingoDeckCardDoc,
  type BingoDeckDoc,
  type BingoFormat,
} from "@/types";
import { byCardLabel, randomCardNumbers, type ParsedBingoCard } from "./bingo-cards";
import { docToTyped, snapToList } from "./converters";

const SCHOOLS = "schools";
const TOOLS = "tools";
const BINGO_DECKS = "bingoDecks";
const CARDS = "cards";

function decksCol(schoolId: string) {
  return collection(db, SCHOOLS, schoolId, BINGO_DECKS);
}

function deckCardsCol(schoolId: string, deckId: string) {
  return collection(db, SCHOOLS, schoolId, BINGO_DECKS, deckId, CARDS);
}

function toolCardsCol(schoolId: string, toolId: string) {
  return collection(db, SCHOOLS, schoolId, TOOLS, toolId, CARDS);
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

/** One template cartón as a deck stores it: just the printed serial + its numbers. */
export interface DeckCardInput {
  label: string;
  numbers: number[];
}

/**
 * Strip a tool's lote down to the deck-template shape (label + numbers), dropping the per-event
 * status/ownerId — a deck is reusable, so a cartón's "sold" state in one bingo means nothing in
 * the next. Order is preserved (the caller passes the lote already label-sorted).
 */
export function deckCardsFromLote(
  cards: Pick<BingoCardDoc, "label" | "numbers">[],
): DeckCardInput[] {
  return cards.map((c) => ({ label: c.label, numbers: c.numbers }));
}

/**
 * Validate a deck name. Returns a Spanish error message, or null when valid. A name is required
 * (the picker lists decks by name) and capped at BINGO_DECK_NAME_MAX.
 */
export function bingoDeckNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Ingresa un nombre para el mazo.";
  if (trimmed.length > BINGO_DECK_NAME_MAX) {
    return `El nombre no puede superar los ${BINGO_DECK_NAME_MAX} caracteres.`;
  }
  return null;
}

// ── Reads (school owner/editor/admin only — enforced by rules) ─────────────────

/** All decks a school has saved, sorted by name. Powers the create-page picker + the Mazos page. */
export async function getBingoDecks(
  schoolId: string,
): Promise<BingoDeckDoc[]> {
  const snap = await getDocs(decksCol(schoolId));
  return snapToList<BingoDeck>(snap).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** One deck by id, or null. Powers the deck detail (manage) page. */
export async function getBingoDeckById(
  schoolId: string,
  deckId: string,
): Promise<BingoDeckDoc | null> {
  return docToTyped<BingoDeck>(
    await getDoc(doc(db, SCHOOLS, schoolId, BINGO_DECKS, deckId)),
  );
}

/** Every template cartón of a deck, ordered by label (numeric-aware), like a tool's lote. */
export async function getBingoDeckCards(
  schoolId: string,
  deckId: string,
): Promise<BingoDeckCardDoc[]> {
  const snap = await getDocs(deckCardsCol(schoolId, deckId));
  return snapToList<BingoDeckCard>(snap).sort(byCardLabel);
}

// ── Writes (school owner/editor/admin only — enforced by rules) ────────────────

const BATCH_LIMIT = 450; // < Firestore's 500-op ceiling, with headroom (matches bingo-cards).

/** Commit a list of batch operations in chunks under Firestore's per-batch limit. */
async function commitInChunks(ops: ((batch: WriteBatch) => void)[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

export interface SaveBingoDeckInput {
  name: string;
  /** The cartón format every cartón in `cards` shares. */
  format: BingoFormat;
  /** The deck's cartones (label + numbers); see deckCardsFromLote. */
  cards: DeckCardInput[];
  createdBy: string;
  createdByName?: string;
}

/**
 * Save a new deck: the deck doc (name + format + denormalized count) plus its cartones in the
 * nested `cards` subcollection. The deck doc is created first (addDoc → id), then the cartones are
 * written in batches under the per-batch limit (a deck can hold up to BINGO_CARD_MAX cartones).
 * Returns the new deck id. The caller validates the name (bingoDeckNameError) and passes the
 * current user as createdBy (the rules require createdBy == auth.uid).
 */
export async function saveBingoDeck(
  schoolId: string,
  input: SaveBingoDeckInput,
): Promise<string> {
  const ref = await addDoc(decksCol(schoolId), {
    name: input.name,
    format: input.format,
    cardCount: input.cards.length,
    createdBy: input.createdBy,
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const col = deckCardsCol(schoolId, ref.id);
  const ops = input.cards.map((c) => (batch: WriteBatch) => {
    batch.set(doc(col), {
      label: c.label,
      numbers: c.numbers,
      createdAt: serverTimestamp(),
    });
  });
  await commitInChunks(ops);
  return ref.id;
}

/**
 * Delete a deck and its cartones. The nested `cards` are removed first (subcollections aren't
 * cascaded), then the deck doc — so a partial failure leaves the doc, which the picker still lists
 * and a retry can finish clearing.
 */
export async function deleteBingoDeck(
  schoolId: string,
  deckId: string,
): Promise<void> {
  const snap = await getDocs(deckCardsCol(schoolId, deckId));
  await commitInChunks(snap.docs.map((d) => (batch: WriteBatch) => batch.delete(d.ref)));
  await deleteDoc(doc(db, SCHOOLS, schoolId, BINGO_DECKS, deckId));
}

/**
 * Copy a deck's cartones into a bingo tool's lote as fresh `available` cards (preserving each
 * cartón's label + numbers). Used when a bingo is created from a deck. Batched like the import
 * writer. The caller is responsible for setting the tool's bingo.format to the deck's format so
 * the copied cartones line up with the config.
 */
export async function copyDeckToTool(
  schoolId: string,
  deckId: string,
  toolId: string,
): Promise<void> {
  const cards = await getBingoDeckCards(schoolId, deckId);
  const col = toolCardsCol(schoolId, toolId);
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

// ── Deck library management (the dedicated Mazos page) ─────────────────────────
// Beyond "guardar como mazo" (saveBingoDeck) from a bingo's lote, the board can build a deck from
// scratch on its own page: create an empty deck, then generate/import its cartones and view them
// all. A deck card carries no status/ownerId (those are per-event, set only when copied into a
// bingo). The denormalized cardCount is refreshed by the manager after each change
// (setBingoDeckCardCount) — the client owns it; a deck has no fraud-sensitive signal rules must
// guard.

export interface CreateBingoDeckInput {
  name: string;
  format: BingoFormat;
  createdBy: string;
  createdByName?: string;
}

/**
 * Create an EMPTY deck (cardCount 0). The Mazos page then adds cartones (generate/import) from the
 * deck detail view. Returns the new deck id. The caller validates the name (bingoDeckNameError) and
 * format (bingoFormatError) and passes the current user as createdBy (rules require createdBy ==
 * auth.uid on create).
 */
export async function createBingoDeck(
  schoolId: string,
  input: CreateBingoDeckInput,
): Promise<string> {
  const ref = await addDoc(decksCol(schoolId), {
    name: input.name,
    format: input.format,
    cardCount: 0,
    createdBy: input.createdBy,
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Rename a deck (any owner/editor/admin — the update rule keeps createdBy immutable). */
export async function renameBingoDeck(
  schoolId: string,
  deckId: string,
  name: string,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, BINGO_DECKS, deckId), {
    name,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Refresh a deck's denormalized cartón count after its cards change. The detail-page manager calls
 * this with the reloaded card count — keeping the picker list accurate without an aggregation read.
 */
export async function setBingoDeckCardCount(
  schoolId: string,
  deckId: string,
  cardCount: number,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, BINGO_DECKS, deckId), {
    cardCount,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Generate `count` random cartones into a deck, labelled sequentially from `startNumber` (see
 * nextCardStartNumber in ./bingo-cards), zero-padded to a fixed width like a tool's lote. Validate
 * the format first (bingoFormatError). A deck card has no status/ownerId.
 */
export async function generateBingoDeckCards(
  schoolId: string,
  deckId: string,
  format: BingoFormat,
  count: number,
  startNumber = 1,
): Promise<void> {
  const pad = 3;
  const col = deckCardsCol(schoolId, deckId);
  const ops = Array.from({ length: count }, (_, i) => (batch: WriteBatch) => {
    batch.set(doc(col), {
      label: String(startNumber + i).padStart(pad, "0"),
      numbers: randomCardNumbers(format),
      createdAt: serverTimestamp(),
    });
  });
  await commitInChunks(ops);
}

/** Persist already-validated imported cartones into a deck (see parseImportedCards). */
export async function importBingoDeckCards(
  schoolId: string,
  deckId: string,
  cards: ParsedBingoCard[],
): Promise<void> {
  const col = deckCardsCol(schoolId, deckId);
  const ops = cards.map((c) => (batch: WriteBatch) => {
    batch.set(doc(col), {
      label: c.label,
      numbers: c.numbers,
      createdAt: serverTimestamp(),
    });
  });
  await commitInChunks(ops);
}

/** Delete one cartón from a deck (management). */
export async function deleteBingoDeckCard(
  schoolId: string,
  deckId: string,
  cardId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, BINGO_DECKS, deckId, CARDS, cardId));
}

/** Delete every cartón of a deck (keeps the deck doc; the caller resets cardCount to 0). */
export async function clearBingoDeckCards(
  schoolId: string,
  deckId: string,
): Promise<void> {
  const snap = await getDocs(deckCardsCol(schoolId, deckId));
  await commitInChunks(
    snap.docs.map((d) => (batch: WriteBatch) => batch.delete(d.ref)),
  );
}
