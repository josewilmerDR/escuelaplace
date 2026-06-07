/**
 * Helpers para mapear QuerySnapshot/DocumentSnapshot a tipos `*Doc` (con id incluido).
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
