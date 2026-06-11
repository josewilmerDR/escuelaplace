/**
 * Typed reads of the `businesses` collection.
 * These functions are called from server components (SSG/SSR) for SEO.
 */
import { cache } from "react";
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

/**
 * An active business by its unique slug. Returns null if it does not exist OR is not
 * publicly visible (draft/pending/suspended): the public profile is the only consumer,
 * and pausing a page must actually unpublish it — without the status filter a paused
 * business stayed reachable (and indexable) by direct link.
 *
 * Wrapped in React cache(): generateMetadata and the page component both call it with
 * the same slug during one request — the cache dedupes that into a single Firestore
 * query (the Firestore SDK, unlike fetch, gets no deduping from Next).
 */
export const getBusinessBySlug = cache(
  async (slug: string): Promise<BusinessDoc | null> => {
    const q = query(
      collection(db, BUSINESSES),
      where("slug", "==", slug),
      where("status", "==", "active"),
      fbLimit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return docToTyped<Business>(snap.docs[0]);
  },
);

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

/**
 * Active businesses ordered by the stored baseline `ranking.score` (desc). This is the
 * SSR/SEO baseline order; the client re-ranks it per the buyer's community on top (see
 * `rankBusinessFeed`). Search fetches a generous set and gates it by relevance in memory.
 */
export async function getActiveBusinesses(max = 200): Promise<BusinessDoc[]> {
  const q = query(
    collection(db, BUSINESSES),
    where("status", "==", "active"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Business>(await getDocs(q));
}

/** Top active businesses for the explore feed. Thin wrapper over `getActiveBusinesses`. */
export function getTopBusinesses(max = 24): Promise<BusinessDoc[]> {
  return getActiveBusinesses(max);
}
