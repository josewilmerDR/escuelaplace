/**
 * Typed reads of the `schools` collection.
 * The private subcollection (SINPE) is NOT exposed here: it requires admin and a separate access.
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
import type { School, SchoolDoc, SchoolPrivate } from "@/types";
import { docToTyped, snapToList } from "./converters";

const SCHOOLS = "schools";

/** A school by document id. Returns null if it does not exist. */
export async function getSchoolById(id: string): Promise<SchoolDoc | null> {
  return docToTyped<School>(await getDoc(doc(db, SCHOOLS, id)));
}

/** Active schools, ordered by name. For listings/selection. */
export async function getSchools(max = 100): Promise<SchoolDoc[]> {
  const q = query(
    collection(db, SCHOOLS),
    where("status", "==", "active"),
    orderBy("name"),
    fbLimit(max),
  );
  return snapToList<School>(await getDocs(q));
}

/**
 * The school's sensitive data (SINPE) from the private subcollection.
 * Reading requires Firestore auth as the school's owner/editors or admin (see rules);
 * this is for the owner panel / admin, NOT for public rendering.
 */
export async function getSchoolPrivate(
  id: string,
): Promise<SchoolPrivate | null> {
  const snap = await getDoc(doc(db, SCHOOLS, id, "private", "data"));
  return snap.exists() ? (snap.data() as SchoolPrivate) : null;
}

/**
 * The SINPE intended for public display (to businesses wanting to subscribe), gated by
 * verification: returns null unless the school is in `verificationStatus === 'verified'`.
 * Centralizes the "hide SINPE until verified / on re-verification" business rule so no
 * caller can accidentally surface unverified payment data.
 */
export async function getVerifiedSchoolSinpe(
  id: string,
): Promise<SchoolPrivate["sinpe"] | null> {
  const school = await getSchoolById(id);
  if (!school || school.verificationStatus !== "verified") return null;
  const priv = await getSchoolPrivate(id);
  return priv?.sinpe ?? null;
}
