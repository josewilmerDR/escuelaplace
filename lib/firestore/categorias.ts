/**
 * Lecturas tipadas de la colección `categorias`.
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
import type { Categoria, CategoriaDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const CATEGORIAS = "categorias";

/** Todas las categorías ordenadas por el campo `orden`. */
export async function getCategorias(): Promise<CategoriaDoc[]> {
  const q = query(collection(db, CATEGORIAS), orderBy("orden"));
  return snapToList<Categoria>(await getDocs(q));
}

/** Una categoría por id. */
export async function getCategoriaPorId(
  id: string,
): Promise<CategoriaDoc | null> {
  return docToTyped<Categoria>(await getDoc(doc(db, CATEGORIAS, id)));
}
