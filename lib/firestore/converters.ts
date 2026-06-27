/**
 * Shared read helpers for the data layer: map QuerySnapshot/DocumentSnapshot to `*Doc` types
 * (with id included), plus the chunked `in`-query primitive and the createdAt comparators.
 */
import {
  collection,
  type DocumentSnapshot,
  type FieldPath,
  getDocs,
  query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export function docToTyped<T>(
  snap: DocumentSnapshot | QueryDocumentSnapshot,
): (T & { id: string }) | null {
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

export function snapToList<T>(snap: QuerySnapshot): (T & { id: string })[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

/** Firestore `in` accepts at most 30 values per query. */
export const IN_QUERY_LIMIT = 30;

/**
 * Hydrate every doc in `collectionName` whose `field` matches any of `ids`, in chunked `in`
 * queries (a handful of reads, not N+1). Firestore caps `in` at 30 values, so the ids are
 * sliced into batches that run concurrently. The returned order is NOT the input order
 * (Firestore `in` doesn't preserve it) — callers that need a specific order sort the result.
 * Pass `documentId()` as `field` to match by document id. Returns `[]` for an empty id list.
 */
export async function chunkedInQuery<T>(
  collectionName: string,
  field: string | FieldPath,
  ids: string[],
): Promise<(T & { id: string })[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_QUERY_LIMIT) {
    chunks.push(ids.slice(i, i + IN_QUERY_LIMIT));
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, collectionName), where(field, "in", chunk))),
    ),
  );
  return snaps.flatMap((snap) => snapToList<T>(snap));
}

/** A doc carrying a Firestore `createdAt` Timestamp (the only field these comparators read). */
type WithCreatedAt = { createdAt?: { toMillis?: () => number } };

/**
 * Newest-first comparator on `createdAt` — the in-JS sort the data layer uses instead of an
 * `orderBy` (so a `where` clause needs no composite index). Missing dates sort to the end.
 */
export function byCreatedAtDesc(a: WithCreatedAt, b: WithCreatedAt): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/** Oldest-first comparator on `createdAt` (mirror of byCreatedAtDesc). Missing dates sort first. */
export function byCreatedAtAsc(a: WithCreatedAt, b: WithCreatedAt): number {
  return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
}
