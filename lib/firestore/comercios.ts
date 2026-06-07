/**
 * Lecturas tipadas de la colección `comercios`.
 * Estas funciones se llaman desde componentes de servidor (SSG/SSR) para SEO.
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
import type { Comercio, ComercioDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const COMERCIOS = "comercios";

/** Comercios de una escuela, ordenados por ranking.score (desc). Solo activos. */
export async function getComerciosPorEscuela(
  escuelaId: string,
  max = 50,
): Promise<ComercioDoc[]> {
  const q = query(
    collection(db, COMERCIOS),
    where("escuelaId", "==", escuelaId),
    where("estado", "==", "activo"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Comercio>(await getDocs(q));
}

/** Un comercio por su slug único. Devuelve null si no existe. */
export async function getComercioPorSlug(
  slug: string,
): Promise<ComercioDoc | null> {
  const q = query(
    collection(db, COMERCIOS),
    where("slug", "==", slug),
    fbLimit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return docToTyped<Comercio>(snap.docs[0]);
}

/** Un comercio por id de documento. */
export async function getComercioPorId(
  id: string,
): Promise<ComercioDoc | null> {
  return docToTyped<Comercio>(await getDoc(doc(db, COMERCIOS, id)));
}

/** Comercios de una categoría, ordenados por ranking.score (desc). Solo activos. */
export async function getComerciosPorCategoria(
  categoriaId: string,
  max = 50,
): Promise<ComercioDoc[]> {
  const q = query(
    collection(db, COMERCIOS),
    where("categorias", "array-contains", categoriaId),
    where("estado", "==", "activo"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Comercio>(await getDocs(q));
}
