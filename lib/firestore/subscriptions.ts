/**
 * Typed reads AND writes of the `subscriptions` collection (the first-class support
 * relationship business → school). Public read, so reads run from server components (SSR)
 * for the ranking and the public "supports since…" badge, and from the panel; writes
 * (create/confirm/expire) run client-side from the panel.
 *
 * A business subscribes to (commits to support) a school. The business creates it as
 * `pending`; ONLY the target school's board (owner/editors) or admin confirms it (the
 * business can never self-confirm — see firestore.rules). Confirmation is time-boxed
 * (`expiresAt`) and must be renewed, which keeps the ranking from going stale.
 *
 * Status is filtered in JS (not in the query) to avoid composite-index requirements for
 * the MVP; the per-business/per-school result sets are small. The ranking helpers in
 * `./ranking` decide which subscriptions actually count (see `isCountingSubscription`).
 */
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { cache } from "react";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  SUBSCRIPTION_CONFIRMATION_DAYS,
  SUBSCRIPTION_UNIT_CRC,
} from "@/types";
import type { Subscription, SubscriptionDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const SUBSCRIPTIONS = "subscriptions";
const DAY_MS = 86_400_000;

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

/**
 * All personal donations of a user (any status), newest first. The donor's own history shows
 * the magnitude, so the private fields (units/amount) are merged back in — the donor is
 * authorized to read their own subdocs (this only runs client-side, from the donate panel).
 */
export async function getSubscriptionsByDonor(
  donorId: string,
): Promise<SubscriptionDoc[]> {
  const q = query(
    collection(db, SUBSCRIPTIONS),
    where("donorId", "==", donorId),
  );
  const subs = snapToList<Subscription>(await getDocs(q)).sort(byCreatedAtDesc);
  return mergePrivateFields(subs);
}

/**
 * Merge each personal donation's PRIVATE fields (donorName + magnitude `units`/`amount`) back
 * onto the doc — CLIENT-ONLY and best-effort. Those fields live in a private subdoc, not the
 * public doc (so anonymous scrapers can't deanonymize an opt-out donor nor read how much they
 * gave). The authorized viewers (the school's confirmation panel, or the donor on their own
 * history) need them and CAN read the subdoc; the anonymous SSR donor wall is NOT authorized and
 * doesn't render them — so on the server we skip the merge entirely, and on the client an
 * unauthorized read is swallowed. Business subs keep these public, so they're left untouched.
 */
async function mergePrivateFields(
  subs: SubscriptionDoc[],
): Promise<SubscriptionDoc[]> {
  if (typeof window === "undefined") return subs; // SSR: the wall doesn't need them
  await Promise.all(
    subs.map(async (s) => {
      if (s.supporterType !== "user") return; // business subs carry public businessName/units
      try {
        const data = (
          await getDoc(doc(db, SUBSCRIPTIONS, s.id, "private", "data"))
        ).data();
        if (!data) return;
        if (typeof data.donorName === "string") s.donorName = data.donorName;
        if (typeof data.units === "number") s.units = data.units;
        if (typeof data.amount === "number") s.amount = data.amount;
      } catch {
        // Unauthorized (or missing) — leave the fields as-is; callers that render them are
        // authorized (the board, or the donor on their own data) and won't hit this.
      }
    }),
  );
  return subs;
}

/**
 * All subscriptions targeting a school (any status), newest first.
 *
 * Wrapped in React cache(): the public school page reads these both directly (for its
 * support metrics) and indirectly through getSchoolDonorWall during one request — the
 * cache dedupes that into a single Firestore read (the Firestore SDK, unlike fetch, gets
 * no deduping from Next). On the client (the school's confirmation panel) each personal
 * donation's private fields are merged back in; on the server they are not (see mergePrivateFields).
 */
export const getSubscriptionsBySchool = cache(
  async (schoolId: string): Promise<SubscriptionDoc[]> => {
    const q = query(
      collection(db, SUBSCRIPTIONS),
      where("schoolId", "==", schoolId),
    );
    const subs = snapToList<Subscription>(await getDocs(q)).sort(byCreatedAtDesc);
    return mergePrivateFields(subs);
  },
);

/** Statuses a subscription passes through once it has been confirmed at least once. */
const CONFIRMED_STATUSES = ["confirmed", "expiring", "expired"] as const;

/**
 * Bounded, server-side read of a school's CONFIRMED-at-some-point subscriptions, newest
 * confirmation first. Feeds the public page's support metrics (recent unique supporters +
 * average confirmation time), which only ever look at confirmed subscriptions — so the
 * unbounded getSubscriptionsBySchool (which the donor wall also uses) does not need to
 * grow O(N) just to compute them. `max` caps the read well above any window/sample the
 * metrics need.
 *
 * Requires a composite index on subscriptions:
 * (schoolId ASC, status ASC, confirmedAt DESC) — the `in` on status plus orderBy.
 */
export async function getConfirmedSubscriptionsBySchool(
  schoolId: string,
  max = 200,
): Promise<SubscriptionDoc[]> {
  const q = query(
    collection(db, SUBSCRIPTIONS),
    where("schoolId", "==", schoolId),
    where("status", "in", CONFIRMED_STATUSES),
    orderBy("confirmedAt", "desc"),
    fbLimit(max),
  );
  return snapToList<Subscription>(await getDocs(q));
}

/**
 * Pending subscriptions targeting a school — the queue the school's board confirms (the
 * institution validates that each payment proof matches). Newest first.
 *
 * Queries `status == "pending"` server-side (instead of fetching every status and
 * filtering in memory) so the manager strip on the public page reads only the queue it
 * shows. Requires a composite index on subscriptions: (schoolId ASC, status ASC) — the
 * two equality filters.
 */
export async function getPendingSubscriptionsBySchool(
  schoolId: string,
): Promise<SubscriptionDoc[]> {
  const q = query(
    collection(db, SUBSCRIPTIONS),
    where("schoolId", "==", schoolId),
    where("status", "==", "pending"),
  );
  return snapToList<Subscription>(await getDocs(q)).sort(byCreatedAtDesc);
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

// ── Writes (business panel + school confirmation) ────────────────────────────

export interface CreateSubscriptionInput {
  businessId: string;
  businessName: string; // denormalized
  schoolId: string;
  schoolName: string; // denormalized
  /** Integer n in `n × SUBSCRIPTION_UNIT_CRC`. */
  units: number;
}

/**
 * Create a `pending` subscription. Must be called by the business owner/editor (the rules
 * enforce it). `amount` is denormalized from `units`. The payment proof is uploaded
 * separately (see uploadSubscriptionProof) — it must not go in this public doc. Returns
 * the new id.
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<string> {
  const created = await addDoc(collection(db, SUBSCRIPTIONS), {
    supporterType: "business",
    businessId: input.businessId,
    businessName: input.businessName,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    units: input.units,
    amount: input.units * SUBSCRIPTION_UNIT_CRC,
    status: "pending",
    confirmedAt: null,
    firstConfirmedAt: null,
    expiresAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/**
 * Upload (or replace) the payment proof file for a subscription. The file goes to the
 * private Storage path (gated by storage.rules to the business side / school / admin);
 * only the non-sensitive `proofUploaded` flag is written to the public doc. Must be called
 * by the business owner/editor.
 */
export async function uploadSubscriptionProof(
  subscriptionId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(
    storageRef(storage, subscriptionProofPath(subscriptionId)),
    file,
  );
  await updateDoc(doc(db, SUBSCRIPTIONS, subscriptionId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Confirm (or renew) a subscription. Must be called by the school's board (owner/editors)
 * or admin. Sets it to `confirmed`, stamps `confirmedAt`/`confirmedBy`, and sets
 * `expiresAt` `durationDays` from now (computed client-side since serverTimestamp can't be
 * offset). Renewing simply re-confirms and pushes `expiresAt` forward.
 *
 * On the FIRST confirmation it also stamps `firstConfirmedAt`, which renewals never
 * touch — that's what the response-time chip averages. The pre-read costs one get on a
 * panel action; without it a renewal couldn't tell itself apart from a first confirm.
 */
export async function confirmSubscription(
  id: string,
  confirmedBy: string,
  durationDays: number = SUBSCRIPTION_CONFIRMATION_DAYS,
): Promise<void> {
  const ref = doc(db, SUBSCRIPTIONS, id);
  const existing = (await getDoc(ref)).data();
  // Never confirmed before → this confirmation is the school's first response. A
  // legacy doc already confirmed (renewal without firstConfirmedAt) keeps it absent:
  // stamping "now" there would fake a slow response.
  const isFirstConfirmation = existing?.confirmedAt == null;
  await updateDoc(ref, {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    ...(isFirstConfirmation ? { firstConfirmedAt: serverTimestamp() } : {}),
    confirmedBy,
    expiresAt: Timestamp.fromMillis(Date.now() + durationDays * DAY_MS),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Mark a subscription `expired` (no renewal). Intended for the school/admin or a future
 * scheduled job; until then the ranking treats a lapsed `expiresAt` as non-counting
 * regardless of stored status (see `isCountingSubscription`).
 */
export async function expireSubscription(id: string): Promise<void> {
  await updateDoc(doc(db, SUBSCRIPTIONS, id), {
    status: "expired",
    updatedAt: serverTimestamp(),
  });
}
