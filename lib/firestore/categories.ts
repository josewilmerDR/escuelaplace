/**
 * Typed reads AND writes of the `categories` collection. Reads run from server components
 * (the public catalog). Writes are admin-only (firestore.rules: `write if isAdmin()`) and
 * run client-side from the category admin screen (/panel/admin/categories): the taxonomy is
 * curated, not user-generated, so there is no SSR write path.
 */
import { cache } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Category, CategoryDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const CATEGORIES = "categories";

/** All categories ordered by the `order` field. */
export async function getCategories(): Promise<CategoryDoc[]> {
  const q = query(collection(db, CATEGORIES), orderBy("order"));
  return snapToList<Category>(await getDocs(q));
}

/**
 * A category by id.
 *
 * Wrapped in React cache(): on /category/[id], generateMetadata and the page component
 * both call it with the same id during one request — the cache dedupes that into a single
 * Firestore read (the Firestore SDK, unlike fetch, gets no deduping from Next).
 */
export const getCategoryById = cache(
  async (id: string): Promise<CategoryDoc | null> => {
    return docToTyped<Category>(await getDoc(doc(db, CATEGORIES, id)));
  },
);

// ── Writes (admin only) ──────────────────────────────────────────────────────

/** Fields the admin sets when creating a category. */
export interface CreateCategoryInput {
  name: string;
  /** A single emoji glyph shown in the icon tile across the catalog. */
  icon: string;
  /** Sort key; the admin screen passes max(existing order) + 1 to append at the end. */
  order: number;
}

/**
 * Create a category. `businessCount` starts at 0 — it is a function-maintained signal
 * (onBusinessWritten recomputes it as businesses are categorized), never written by the
 * client beyond this initial zero. Returns the new id.
 */
export async function createCategory(
  input: CreateCategoryInput,
): Promise<string> {
  const ref = await addDoc(collection(db, CATEGORIES), {
    name: input.name,
    icon: input.icon,
    order: input.order,
    businessCount: 0,
  });
  return ref.id;
}

/**
 * Update a category's display fields (name / icon). Renaming a category leaves the
 * denormalized `categoryNames` on existing businesses stale until the `onCategoryWritten`
 * Cloud Function re-denormalizes them — the membership match is by id, so listings never
 * break, only the copied label. `businessCount` and `order` are not touched here
 * (order changes go through reorderCategories).
 */
export async function updateCategory(
  id: string,
  input: { name: string; icon: string },
): Promise<void> {
  await updateDoc(doc(db, CATEGORIES, id), {
    name: input.name,
    icon: input.icon,
  });
}

/**
 * Persist a new ordering: writes `order = index` for each id in one atomic batch, so the
 * list never flashes a duplicate/missing order between writes. The admin screen reorders its
 * local array (move up/down) and passes the full id sequence.
 */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, CATEGORIES, id), { order: index });
  });
  await batch.commit();
}

/**
 * Delete a category. Guarded against orphaning: a category that active businesses still list
 * keeps its id in their `categories[]`, so deleting it would strand that denormalized
 * membership (and the `/category/[id]` page would 404 while cards still show the name).
 * Refuses when `businessCount > 0` — the admin must reassign those businesses first. Reads
 * the live count so a stale client view can't slip a non-empty delete through.
 */
export async function deleteCategory(id: string): Promise<void> {
  const ref = doc(db, CATEGORIES, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const count = (snap.get("businessCount") as number | undefined) ?? 0;
  if (count > 0) {
    throw new Error(
      "No se puede borrar una categoría con comercios. Reasigná esos comercios primero.",
    );
  }
  await deleteDoc(ref);
}
