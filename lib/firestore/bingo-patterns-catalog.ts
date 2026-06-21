/**
 * The school's saved custom bingo patterns (schools/{schoolId}/bingoPatterns) — its reusable
 * catalog of "modalidades / formas de ganar" beyond the 10 built-ins. Reusable across ALL of the
 * school's bingos. Each doc holds only a name + the drawn cells on the fixed 5×5 grid; the live
 * arrangement derives as [cells].
 *
 * Read is public (the picker and the public live guide resolve them); only the school's
 * owner/editors write. These carry NO money and NO function-maintained signal — the anti-cheat
 * truth is the frozen activePattern snapshot on the event/claim, never this catalog
 * (see @/lib/bingo-patterns). The `custom:` id prefix can never collide with a built-in id.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  PatternDef,
  SavedBingoPattern,
  SavedBingoPatternDoc,
} from "@/types";
import { snapToList } from "./converters";

const SCHOOLS = "schools";
const BINGO_PATTERNS = "bingoPatterns";

function patternsCol(schoolId: string) {
  return collection(db, SCHOOLS, schoolId, BINGO_PATTERNS);
}

/** All custom patterns a school has saved, sorted by name. */
export async function getSavedBingoPatterns(
  schoolId: string,
): Promise<SavedBingoPatternDoc[]> {
  const snap = await getDocs(patternsCol(schoolId));
  return snapToList<SavedBingoPattern>(snap).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export interface SaveBingoPatternInput {
  name: string;
  /** Distinct cell indices in 0..24 (length 1..25). */
  cells: number[];
  createdBy: string;
  createdByName?: string;
}

/** Save a new custom pattern to the school's catalog. Returns the new doc id. */
export async function saveBingoPattern(
  schoolId: string,
  input: SaveBingoPatternInput,
): Promise<string> {
  const ref = await addDoc(patternsCol(schoolId), {
    name: input.name,
    cells: input.cells,
    createdBy: input.createdBy,
    ...(input.createdByName ? { createdByName: input.createdByName } : {}),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Remove a saved pattern from the catalog (school owner/editor or admin). */
export async function deleteSavedBingoPattern(
  schoolId: string,
  patternId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, BINGO_PATTERNS, patternId));
}

/**
 * Resolve a saved-pattern doc to a PatternDef (kind 'custom'). The single stored arrangement is
 * the exact drawn cells (all required to win); the preview highlights those same cells.
 */
export function toPatternDef(saved: SavedBingoPatternDoc): PatternDef {
  return {
    id: `custom:${saved.id}`,
    name: saved.name,
    kind: "custom",
    arrangements: [saved.cells],
    preview: saved.cells,
  };
}
