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

/**
 * Schools open for selection (pickers, support/donation flows), ordered by name.
 * Deliberately includes `pending`: a just-created school must be selectable by buyers
 * and by the business that wants to support it — verification gates the SINPE (see
 * getVerifiedSchoolSinpe), not the school's presence in lists. Only `inactive`
 * (delisted) schools are excluded.
 *
 * The cap exists so a runaway collection can't blow up every picker mount; schools
 * beyond it silently disappear from selectors, so it is set well above the current
 * volume. If the directory ever outgrows it, the pickers (Combobox) should switch to
 * querying by name prefix instead of raising it again.
 */
export async function getSchools(max = 500): Promise<SchoolDoc[]> {
  const q = query(
    collection(db, SCHOOLS),
    where("status", "in", ["active", "pending"]),
    orderBy("name"),
    fbLimit(max),
  );
  return snapToList<School>(await getDocs(q));
}

const SCHOOLS_CACHE_TTL_MS = 5 * 60_000;
let schoolsCache: { at: number; data: SchoolDoc[] } | null = null;

/**
 * `getSchools()` behind a module-level TTL cache. The school list changes rarely but is
 * read by the community picker on every page that mounts it (/, /buscar, /category/*) —
 * without the cache each client navigation pays a full ~100-doc Firestore read and the
 * combobox flashes empty while it loads. Errors are not cached (next call retries).
 */
export async function getSchoolsCached(): Promise<SchoolDoc[]> {
  if (schoolsCache && Date.now() - schoolsCache.at < SCHOOLS_CACHE_TTL_MS) {
    return schoolsCache.data;
  }
  const data = await getSchools();
  schoolsCache = { at: Date.now(), data };
  return data;
}

/**
 * Drop the TTL cache. Called right after creating a school so the pickers (create
 * business, donate, subscribe) list it immediately instead of after the TTL.
 */
export function invalidateSchoolsCache(): void {
  schoolsCache = null;
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
