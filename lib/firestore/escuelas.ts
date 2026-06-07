/**
 * Lecturas tipadas de la colección `escuelas`.
 * La subcolección privada (SINPE) NO se expone aquí: requiere admin y un acceso aparte.
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
import type { Escuela, EscuelaDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const ESCUELAS = "escuelas";

/** Una escuela por id de documento. Devuelve null si no existe. */
export async function getEscuelaPorId(id: string): Promise<EscuelaDoc | null> {
  return docToTyped<Escuela>(await getDoc(doc(db, ESCUELAS, id)));
}

/** Escuelas activas, ordenadas por nombre. Para listados/selección. */
export async function getEscuelas(max = 100): Promise<EscuelaDoc[]> {
  const q = query(
    collection(db, ESCUELAS),
    where("estado", "==", "activa"),
    orderBy("nombre"),
    fbLimit(max),
  );
  return snapToList<Escuela>(await getDocs(q));
}
