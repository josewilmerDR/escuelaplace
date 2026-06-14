/**
 * Typed reads of the `categories` collection.
 */
import { cache } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
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
