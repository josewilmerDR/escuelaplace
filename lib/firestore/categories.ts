/**
 * Typed reads of the `categories` collection.
 */
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

/** A category by id. */
export async function getCategoryById(
  id: string,
): Promise<CategoryDoc | null> {
  return docToTyped<Category>(await getDoc(doc(db, CATEGORIES, id)));
}
