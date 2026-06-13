/**
 * Typed reads of the `subscriptions` collection (the first-class support relationship
 * business → school). Public read, so these run from server components (SSR) for the
 * ranking and the public "supports since…" badge, and from the panel.
 *
 * Status is filtered in JS (not in the query) to avoid composite-index requirements for
 * the MVP; the per-business/per-school result sets are small. The ranking helpers in
 * `./ranking` decide which subscriptions actually count (see `isCountingSubscription`).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type { Subscription, SubscriptionDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const SUBSCRIPTIONS = "subscriptions";

/**
 * Display name of whoever supports: the business page, or the donating user. Meant for
 * the school's confirmation/history UI — public surfaces must not render `donorName`
 * (recognition is opt-in via donorProfiles).
 */
export function supporterNameOf(
  sub: Pick<Subscription, "supporterType" | "businessName" | "donorName">,
): string {
  const name =
    sub.supporterType === "user" ? sub.donorName : sub.businessName;
  return name ?? "—";
}

/** Private Storage path of a subscription's payment proof (gated by storage.rules). */
export function subscriptionProofPath(subscriptionId: string): string {
  return `subscription-proofs/${subscriptionId}/proof`;
}

/**
 * A temporary URL to view a subscription's payment proof, or null if there is none / access
 * is denied. The read is gated by storage.rules (business side, target school, or admin),
 * so this is called on demand from the panel — the URL is never stored in the public doc.
 */
export async function getSubscriptionProofUrl(
  subscriptionId: string,
): Promise<string | null> {
  try {
    return await getDownloadURL(
      storageRef(storage, subscriptionProofPath(subscriptionId)),
    );
  } catch {
    return null;
  }
}

/** Sort by createdAt (desc) in JS to avoid a composite index with the where clause. */
function byCreatedAtDesc(a: SubscriptionDoc, b: SubscriptionDoc): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/** A subscription by document id. Returns null if it does not exist. */
export async function getSubscriptionById(
  id: string,
): Promise<SubscriptionDoc | null> {
  return docToTyped<Subscription>(await getDoc(doc(db, SUBSCRIPTIONS, id)));
}

/** All subscriptions of a business (any status), newest first. */
export async function getSubscriptionsByBusiness(
  businessId: string,
): Promise<SubscriptionDoc[]> {
  const q = query(
    collection(db, SUBSCRIPTIONS),
    where("businessId", "==", businessId),
  );
  return snapToList<Subscription>(await getDocs(q)).sort(byCreatedAtDesc);
}

/** All personal donations of a user (any status), newest first. */
export async function getSubscriptionsByDonor(
  donorId: string,
): Promise<SubscriptionDoc[]> {
  const q = query(
    collection(db, SUBSCRIPTIONS),
    where("donorId", "==", donorId),
  );
  return snapToList<Subscription>(await getDocs(q)).sort(byCreatedAtDesc);
}

/** All subscriptions targeting a school (any status), newest first. */
export async function getSubscriptionsBySchool(
  schoolId: string,
): Promise<SubscriptionDoc[]> {
  const q = query(
    collection(db, SUBSCRIPTIONS),
    where("schoolId", "==", schoolId),
  );
  return snapToList<Subscription>(await getDocs(q)).sort(byCreatedAtDesc);
}

/**
 * Pending subscriptions targeting a school — the queue the school's board confirms (the
 * institution validates that each payment proof matches). Newest first.
 */
export async function getPendingSubscriptionsBySchool(
  schoolId: string,
): Promise<SubscriptionDoc[]> {
  return (await getSubscriptionsBySchool(schoolId)).filter(
    (s) => s.status === "pending",
  );
}

/** Firestore `in` accepts at most 30 values per query. */
const IN_CHUNK = 30;

/**
 * All subscriptions for a set of businesses, fetched in chunked `in` queries (not N+1).
 * Used by the ranking feed to reconstruct each business's support signals in a handful of
 * reads. Order is not guaranteed — the caller groups by `businessId`.
 */
export async function getSubscriptionsForBusinesses(
  businessIds: string[],
): Promise<SubscriptionDoc[]> {
  if (businessIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < businessIds.length; i += IN_CHUNK) {
    chunks.push(businessIds.slice(i, i + IN_CHUNK));
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(
        query(collection(db, SUBSCRIPTIONS), where("businessId", "in", chunk)),
      ),
    ),
  );
  return snaps.flatMap((s) => snapToList<Subscription>(s));
}
