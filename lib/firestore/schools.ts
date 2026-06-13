/**
 * Typed reads of the `schools` collection.
 * The private subcollection (payment methods) is gated separately: owner/editors/admin
 * always; everyone else only through getVerifiedSchoolPaymentMethods.
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
import type { PaymentMethod, School, SchoolDoc, SchoolPrivate } from "@/types";
import { docToTyped, snapToList } from "./converters";

const SCHOOLS = "schools";

/** A school by document id. Returns null if it does not exist. */
export async function getSchoolById(id: string): Promise<SchoolDoc | null> {
  return docToTyped<School>(await getDoc(doc(db, SCHOOLS, id)));
}

/**
 * Schools open for selection (pickers, support/donation flows), ordered by name.
 * Deliberately includes `pending`: a just-created school must be selectable by buyers
 * and by the business that wants to support it — verification gates the payment methods
 * (see getVerifiedSchoolPaymentMethods), not the school's presence in lists. Only `inactive`
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
 * The school's sensitive payment data from the private subcollection.
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
 * Normalize a private doc into the payment-method list, folding the legacy single
 * SINPE (docs predating `paymentMethods`) into an equivalent entry. Pure — shared by
 * the gated read below and the owner's edit form.
 */
export function paymentMethodsOf(
  priv: SchoolPrivate | null | undefined,
): PaymentMethod[] {
  if (priv?.paymentMethods?.length) return priv.paymentMethods;
  if (priv?.sinpe?.number) {
    return [
      {
        label: "SINPE Móvil",
        value: priv.sinpe.accountHolder
          ? `${priv.sinpe.number} (${priv.sinpe.accountHolder})`
          : priv.sinpe.number,
      },
    ];
  }
  return [];
}

/**
 * The payment methods intended for display to supporters (donors and businesses wanting
 * to subscribe), gated by verification: returns null unless the school is in
 * `verificationStatus === 'verified'` ([] when verified but none published yet).
 * Centralizes the "hide payment data until verified / on re-verification" business rule
 * so no caller can accidentally surface unverified payment data.
 */
export async function getVerifiedSchoolPaymentMethods(
  id: string,
): Promise<PaymentMethod[] | null> {
  const school = await getSchoolById(id);
  if (!school || school.verificationStatus !== "verified") return null;
  return paymentMethodsOf(await getSchoolPrivate(id));
}
