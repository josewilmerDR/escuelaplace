/**
 * Helpers to map QuerySnapshot/DocumentSnapshot to `*Doc` types (with id included).
 */
import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "firebase/firestore";

export function docToTyped<T>(
  snap: DocumentSnapshot | QueryDocumentSnapshot,
): (T & { id: string }) | null {
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

export function snapToList<T>(snap: QuerySnapshot): (T & { id: string })[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
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
