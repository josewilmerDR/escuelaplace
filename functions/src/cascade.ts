/**
 * Cascade-deletion engine (Admin SDK) — the cleanup the client can never do.
 *
 * A page/account deletion has to touch documents, subcollections and Storage objects across the
 * permission boundary the client SDK cannot cross (other parties' private subdocs, the closed
 * `applause` ledger, payment proofs, the Auth account) AND it has to leave the denormalized
 * ranking/metric/tier/tally signals consistent. The client can do neither (decision #5), so the
 * whole cascade runs here with Admin privileges.
 *
 * Design note — recompute is NOT re-implemented here. The existing `onDocumentWritten` triggers
 * (onSubscriptionWritten, onProjectContributionWritten, onPageantVoteWritten, onReviewWritten,
 * onBusinessWritten, onSchoolWritten) already fire on DELETE and on the anonymizing UPDATEs below,
 * and every recompute helper is delete-safe (it no-ops when its parent is gone, and a deleted
 * school drops out of the anti-fraud eligibility gate). So this module only deletes/anonymizes the
 * leaf records; the triggers reconcile the aggregates. The trade-off is fan-out volume (one trigger
 * per leaf), acceptable at this catalog's scale; a huge page would move to a two-phase
 * tombstone-then-purge job (see deletion.ts).
 *
 * Anonymization policy (the user-chosen "anonymize & retain aggregate"): a personal support record
 * that is ALSO a counterparty's public record (a project's `raised`, a candidate's `voteSupport`,
 * the fraud trail) is not destroyed — its identity is severed (the real donor/buyer uid REPLACED by
 * a stable anonymous token + any denormalized name removed, the payment proof deleted) while the
 * money figure (`amount`/`units`) is kept. Replacing the uid (rather than dropping it) keeps BOTH
 * the magnitude AND the distinct-supporter COUNTS honest: the recompute helpers gate on a present
 * supporter id, so a stable token preserves the count exactly as the real uid did — the counterparty
 * just sees an anonymous supporter instead of a named one. The admin-only `auditEvents` trail is
 * retained under the fraud-prevention / legal-obligation exemption.
 */
import { createHash } from "node:crypto";
import { FieldValue, type Query, type DocumentReference, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

/**
 * A stable, non-reversible token that replaces a deleted user's uid on their RETAINED records.
 * Derived from the uid by SHA-256 so it can't be linked back to the person without already knowing
 * their uid, and DETERMINISTIC so every record of that user gets the SAME token — which keeps the
 * counterparty's distinct-supporter counts correct (project contributorsCount, candidate
 * supportCount, school uniqueSupporters, padrinoCount) and makes a retried deletion idempotent.
 * A token has no `users/{token}` doc, so the recompute donor-profile guard treats it as a deleted
 * account and never mints an orphan recognition profile for it.
 */
function anonTokenFor(uid: string): string {
  return `deleted_${createHash("sha256").update(uid).digest("hex").slice(0, 24)}`;
}

const USERS = "users";
const SUBSCRIPTIONS = "subscriptions";
const PROJECT_CONTRIBUTIONS = "projectContributions";
const PAGEANT_VOTES = "pageantVotes";
const RAFFLE_ORDERS = "raffleOrders";
const PRODUCT_ORDERS = "productOrders";
const BINGO_ORDERS = "bingoOrders";
const THANK_YOUS = "thankYous";

/** Storage prefix (folder) for each record's payment proof. Mirrors storage.rules. */
const proofPrefixes = {
  [SUBSCRIPTIONS]: (id: string) => `subscription-proofs/${id}/`,
  [PROJECT_CONTRIBUTIONS]: (id: string) => `project-contribution-proofs/${id}/`,
  [PAGEANT_VOTES]: (id: string) => `pageant-vote-proofs/${id}/`,
  [RAFFLE_ORDERS]: (id: string) => `raffle-order-proofs/${id}/`,
  [PRODUCT_ORDERS]: (id: string) => `product-order-proofs/${id}/`,
  [BINGO_ORDERS]: (id: string) => `bingo-order-proofs/${id}/`,
} as const;

/**
 * Run an async op over each item in bounded-concurrency chunks — the same backstop as index.ts's
 * runInChunks (N9): a page with thousands of records would otherwise fire thousands of concurrent
 * deletes/updates (and their trigger fan-out) at once.
 */
const CONCURRENCY = 25;
export async function inChunks<T>(
  items: T[],
  op: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(op));
  }
}

/** The uids that administer a page (owner + editors). Duplicated from index.ts (no shared module
 * between the trigger file and this one — kept tiny and in sync deliberately). */
function principalsOf(data: { ownerId?: unknown; editorIds?: unknown } | undefined): string[] {
  const ids = new Set<string>();
  if (!data) return [];
  if (typeof data.ownerId === "string") ids.add(data.ownerId);
  if (Array.isArray(data.editorIds)) {
    for (const e of data.editorIds) if (typeof e === "string") ids.add(e);
  }
  return [...ids];
}

/** Best-effort delete of every Storage object under a prefix. Storage GC is not transactional with
 * Firestore, and a missing folder is not an error — so failures are logged, never thrown (a stuck
 * proof must not abort an erasure). */
export async function deleteStoragePrefix(prefix: string): Promise<void> {
  try {
    await getStorage().bucket().deleteFiles({ prefix });
  } catch (err) {
    logger.warn("deleteStoragePrefix failed (best-effort)", { prefix, err: String(err) });
  }
}

/** Delete a document and ALL its descendants (subcollections) in one Admin SDK call. Used for the
 * page docs and for each top-level record (which carries a `private/data` subdoc). */
export function deleteDeep(ref: DocumentReference): Promise<void> {
  return db.recursiveDelete(ref);
}

/**
 * Delete every doc a query matches, deep (doc + its private subdoc), plus its payment proof. Each
 * delete re-fires that collection's trigger, which reconciles the affected aggregates.
 */
async function deleteByQuery(
  query: Query,
  proofPrefix?: (id: string) => string,
): Promise<number> {
  const snap = await query.get();
  await inChunks(snap.docs, async (d) => {
    await deleteDeep(d.ref);
    if (proofPrefix) await deleteStoragePrefix(proofPrefix(d.id));
  });
  return snap.size;
}

/** Anonymize a single support record (public doc + private subdoc + proof). Replaces the real uid
 * with a stable anonymous token and clears any denormalized name + the proof, while KEEPING the
 * `amount`/`units` so the counterparty's magnitude AND distinct-supporter count stay honest. */
async function anonymizeRecord(
  collection: keyof typeof proofPrefixes,
  ref: DocumentReference,
  idField: "donorId" | "buyerId",
  token: string,
): Promise<void> {
  // Public doc: swap the uid for the anonymous token + drop any denormalized name; keep amount/units.
  await ref.update({
    [idField]: token,
    donorName: FieldValue.delete(),
    buyerName: FieldValue.delete(),
    anonymized: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Private subdoc: drop the real name; keep the magnitude the aggregate is computed from.
  try {
    await ref.collection("private").doc("data").update({
      donorName: FieldValue.delete(),
      buyerName: FieldValue.delete(),
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 5) throw err; // 5 = NOT_FOUND: no private subdoc
  }
  await deleteStoragePrefix(proofPrefixes[collection](ref.id));
}

/**
 * Anonymize every record in `collection` where `idField == uid`. Returns how many were anonymized.
 * The records survive under a stable anonymous token, so the counterparty's aggregates (magnitude
 * AND distinct-supporter counts) stay honest; the person is erased from them.
 */
export async function anonymizeDonorRecords(
  collection: keyof typeof proofPrefixes,
  idField: "donorId" | "buyerId",
  uid: string,
): Promise<number> {
  const token = anonTokenFor(uid);
  const snap = await db.collection(collection).where(idField, "==", uid).get();
  await inChunks(snap.docs, (d) => anonymizeRecord(collection, d.ref, idField, token));
  return snap.size;
}

/** Remove a page from a user's `managedPages` (any role). arrayRemove needs an exact object match
 * we don't have, so read-filter-write. No-op if the user or the entry is gone. */
export async function unlinkManagedPage(
  uid: string,
  type: "business" | "school",
  id: string,
): Promise<void> {
  const ref = db.collection(USERS).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const pages = (snap.get("managedPages") as { type?: string; id?: string }[] | undefined) ?? [];
  const next = pages.filter((p) => !(p.type === type && p.id === id));
  if (next.length !== pages.length) {
    await ref.update({ managedPages: next, updatedAt: FieldValue.serverTimestamp() });
  }
}

/**
 * Purge a business page: its outgoing support (→ schools) + proofs, the business doc with all its
 * subcollections (reviews / metricsDaily / private) + its Storage assets, and the managedPages
 * links on its administrators. Deleting the support docs reconciles each supported SCHOOL's
 * counters; deleting the business doc reconciles each category's businessCount.
 */
export async function purgeBusiness(businessId: string): Promise<void> {
  const ref = db.collection("businesses").doc(businessId);
  const principals = principalsOf((await ref.get()).data());

  await deleteByQuery(
    db.collection(SUBSCRIPTIONS).where("businessId", "==", businessId),
    proofPrefixes[SUBSCRIPTIONS],
  );
  await deleteDeep(ref);
  await deleteStoragePrefix(`businesses/${businessId}/`);
  await inChunks(principals, (uid) => unlinkManagedPage(uid, "business", businessId));
}

/**
 * Purge a school page: every top-level record that references it (support, contributions, pageant
 * votes, orders, thank-yous) + their proofs, then the school doc with EVERYTHING under it
 * (private/data, projects, tools + their subcollections, bingoDecks, bingoPatterns, config) + its
 * Storage tree, and the managedPages links on its administrators. Each support delete reconciles
 * the supporting businesses' rankings + donor profiles; each tool-doc delete re-fires onToolDeleted
 * for its own Storage/strays.
 */
export async function purgeSchool(schoolId: string): Promise<void> {
  const ref = db.collection("schools").doc(schoolId);
  const principals = principalsOf((await ref.get()).data());

  await deleteByQuery(db.collection(SUBSCRIPTIONS).where("schoolId", "==", schoolId), proofPrefixes[SUBSCRIPTIONS]);
  await deleteByQuery(db.collection(PROJECT_CONTRIBUTIONS).where("schoolId", "==", schoolId), proofPrefixes[PROJECT_CONTRIBUTIONS]);
  await deleteByQuery(db.collection(PAGEANT_VOTES).where("schoolId", "==", schoolId), proofPrefixes[PAGEANT_VOTES]);
  await deleteByQuery(db.collection(RAFFLE_ORDERS).where("schoolId", "==", schoolId), proofPrefixes[RAFFLE_ORDERS]);
  await deleteByQuery(db.collection(PRODUCT_ORDERS).where("schoolId", "==", schoolId), proofPrefixes[PRODUCT_ORDERS]);
  await deleteByQuery(db.collection(BINGO_ORDERS).where("schoolId", "==", schoolId), proofPrefixes[BINGO_ORDERS]);
  await deleteByQuery(db.collection(THANK_YOUS).where("schoolId", "==", schoolId));

  await deleteDeep(ref);
  await deleteStoragePrefix(`schools/${schoolId}/`);
  await inChunks(principals, (uid) => unlinkManagedPage(uid, "school", schoolId));
}

/**
 * Clean up after a single tool's deletion — the cascade the per-tool client delete never did, AND
 * the per-tool stragglers a school purge leaves. Idempotent (safe to run twice): recursively delete
 * the tool's own subcollections (candidates / applause / cards / claims / event), its Storage tree,
 * and its top-level buyer/supporter records (orders, pageant votes) + proofs. A padrino subscription
 * tagged with a pageant tool is a real recurring donation to the SCHOOL, so it is un-linked (the
 * dead candidate pointer cleared), not deleted.
 */
export async function purgeTool(schoolId: string, toolId: string): Promise<void> {
  const toolRef = db.collection("schools").doc(schoolId).collection("tools").doc(toolId);
  await deleteDeep(toolRef);
  await deleteStoragePrefix(`schools/${schoolId}/tools/${toolId}/`);

  await deleteByQuery(db.collection(RAFFLE_ORDERS).where("toolId", "==", toolId), proofPrefixes[RAFFLE_ORDERS]);
  await deleteByQuery(db.collection(PRODUCT_ORDERS).where("toolId", "==", toolId), proofPrefixes[PRODUCT_ORDERS]);
  await deleteByQuery(db.collection(BINGO_ORDERS).where("toolId", "==", toolId), proofPrefixes[BINGO_ORDERS]);
  await deleteByQuery(db.collection(PAGEANT_VOTES).where("toolId", "==", toolId), proofPrefixes[PAGEANT_VOTES]);

  const padrinos = await db.collection(SUBSCRIPTIONS).where("pageantToolId", "==", toolId).get();
  await inChunks(padrinos.docs, (d) =>
    d.ref.update({
      pageantToolId: FieldValue.delete(),
      candidateId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );
}
