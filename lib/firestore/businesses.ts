/**
 * Typed reads of the `businesses` collection.
 * These functions are called from server components (SSG/SSR) for SEO.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Business, BusinessDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const BUSINESSES = "businesses";

/** Businesses of a school, ordered by ranking.score (desc). Active only. */
export async function getBusinessesBySchool(
  schoolId: string,
  max = 50,
): Promise<BusinessDoc[]> {
  const q = query(
    collection(db, BUSINESSES),
    where("schoolId", "==", schoolId),
    where("status", "==", "active"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Business>(await getDocs(q));
}

/** A business by its unique slug. Returns null if it does not exist. */
export async function getBusinessBySlug(
  slug: string,
): Promise<BusinessDoc | null> {
  const q = query(
    collection(db, BUSINESSES),
    where("slug", "==", slug),
    fbLimit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return docToTyped<Business>(snap.docs[0]);
}

/** A business by document id. */
export async function getBusinessById(
  id: string,
): Promise<BusinessDoc | null> {
  return docToTyped<Business>(await getDoc(doc(db, BUSINESSES, id)));
}

/** Businesses of a category, ordered by ranking.score (desc). Active only. */
export async function getBusinessesByCategory(
  categoryId: string,
  max = 50,
): Promise<BusinessDoc[]> {
  const q = query(
    collection(db, BUSINESSES),
    where("categories", "array-contains", categoryId),
    where("status", "==", "active"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Business>(await getDocs(q));
}
