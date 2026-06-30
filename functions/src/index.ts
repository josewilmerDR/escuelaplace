/**
 * Cloud Functions (Gen 2) that maintain the denormalized ranking signals across the
 * permission boundary the client SDK cannot cross.
 *
 * Why these run server-side: when a SCHOOL board confirms a subscription, the signed-in
 * user is the school's owner — who is NOT allowed to write the BUSINESS document (rules
 * limit that to the business owner/editor or admin). So recomputing the business's
 * `ranking.score` must happen with Admin privileges, here.
 *
 * - onSubscriptionWritten: recompute the affected business's baseline score + totalDonated,
 *   the affected school's supportingBusinesses/uniqueSupporters, and — for personal
 *   donations — the donor's recognition profile, on any subscription create/update/delete.
 *   A personal donation tagged with a pageant candidate (a padrino) also recomputes that
 *   candidate's padrinoCount.
 *   The business ranking applies an anti-fraud eligibility gate (verified school + no
 *   self-dealing) — see recomputeBusinessRanking. On a confirmation it also appends a
 *   non-sensitive audit event (auditEvents) for fraud review / the risk-scoring feature store.
 * - onSchoolWritten: when a school's verification status or its administrators change (both
 *   feed that eligibility gate), recompute every business supporting it — those changes
 *   don't touch any subscription, so the trigger above wouldn't fire on its own.
 * - onBusinessWritten: recompute the `businessCount` of every category the business belongs
 *   to (active businesses only) on any business create/update/delete. The client writes a
 *   business's `categories` but can't keep a category's aggregate current, so — like every
 *   other denormalized signal (decision #5) — it's maintained here with Admin privileges.
 * - onCategoryWritten: when a category is RENAMED, re-denormalize the `categoryNames` label
 *   copied onto every business in that category (admin-only write, cross-collection — the
 *   client can't maintain it). Listings match by id, so only the stale label is corrected.
 * - expireSubscriptionsDaily: time-decay the lifecycle — flip lapsed subscriptions to
 *   `expired` and near-expiry ones to `expiring`. The status writes re-fire the trigger
 *   above, which recomputes the affected docs.
 * - expirePendingOrdersDaily: sweep UNCONFIRMED orders (raffle/product/bingo/pageantVote) —
 *   delete those abandoned past the stale window (frees reserved raffle numbers / bingo
 *   cartones) and cap a single buyer's pending pile-up per tool (the per-buyer rate-limit the
 *   rules can't count). Deletes the public doc + its private subdoc.
 * - trackInteraction (./track): unauthenticated view/click counters for the funnel
 *   report — anonymous buyers can't write Firestore directly.
 * - recordWalkIn (./track): manager-only counter of walk-in customers who mentioned
 *   escuelaplace at the counter.
 * - castPageantApplause: the accountless "simpatía" vote for a pageant candidate. App
 *   Check-gated (the bot wall), it writes the closed applause ledger; onApplauseWritten
 *   then recomputes the candidate's voteFree COUNT. The sympathy axis is non-binding and
 *   capped, and freeVotingEnabled stays off until App Check is proven in prod.
 */
import { createHash } from "node:crypto";
import { getAppCheck } from "firebase-admin/app-check";
import { initializeApp } from "firebase-admin/app";
import {
  type DocumentReference,
  FieldValue,
  type QueryDocumentSnapshot,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { donorTierForUnits } from "./donors";
import { DOC_ID_RE, parseBeaconBody } from "./http";
import {
  EXPIRING_WINDOW_DAYS,
  type ReviewStatsLike,
  type ScorableSubscription,
  baselineScore,
  isCounting,
} from "./ranking";
import {
  type ThankYouMilestoneKind,
  completedYears,
  planThankYou,
  renderThankYou,
} from "./thanks";

// Cap concurrent instances for EVERY function in this deployment (triggers + the two public
// onRequest endpoints castPageantApplause/trackInteraction, which live in ./track but share this
// deployment). Gen2 defaults to maxInstances=1000; an unauthenticated request flood against the
// onRequest endpoints would otherwise fan out to that ceiling = denial-of-wallet (#N2). 10 is an
// ample ceiling for this catalog's volume (×~80 concurrency each) and a hard cost backstop; tune up
// if legitimate trigger throughput ever needs it. Region is intentionally left at the default —
// pinning a new one would change the live function URLs the client already calls.
setGlobalOptions({ maxInstances: 10 });

initializeApp();
const db = getFirestore();

export { recordWalkIn, trackInteraction } from "./track";
export { grantAdminRole, revokeAdminRole } from "./admin";
export { reserveRaffleNumbers } from "./raffle";
export { deleteAccount, deletePage, exportMyData, onToolDeleted } from "./deletion";

const DAY_MS = 86_400_000;

/**
 * Run async tasks in bounded-concurrency chunks (N9). A school with thousands of supporting
 * businesses / pageant candidates would otherwise fan out thousands of concurrent recomputes in ONE
 * trigger invocation; this caps how many run at once while still finishing in order.
 */
const FANOUT_CONCURRENCY = 50;
async function runInChunks(tasks: (() => Promise<unknown>)[]): Promise<void> {
  for (let i = 0; i < tasks.length; i += FANOUT_CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + FANOUT_CONCURRENCY).map((t) => t()));
  }
}
const SUBSCRIPTIONS = "subscriptions";
const BUSINESSES = "businesses";
const SCHOOLS = "schools";
const REVIEWS = "reviews";
const DONOR_PROFILES = "donorProfiles";
const USERS = "users";
const PROJECTS = "projects";
const PROJECT_CONTRIBUTIONS = "projectContributions";
const AUDIT_EVENTS = "auditEvents";
const CATEGORIES = "categories";
const THANK_YOUS = "thankYous";
const PAGEANT_VOTES = "pageantVotes";
const TOOLS = "tools";
const CANDIDATES = "candidates";
const APPLAUSE = "applause";
const RAFFLE_ORDERS = "raffleOrders";
const PRODUCT_ORDERS = "productOrders";
const BINGO_ORDERS = "bingoOrders";
// Every buyable kind's order collection (buyer→school, pending until the school confirms). They
// share the same lifecycle, so the daily pending-order hygiene below sweeps them uniformly.
const ORDER_COLLECTIONS = [
  RAFFLE_ORDERS,
  PRODUCT_ORDERS,
  BINGO_ORDERS,
  PAGEANT_VOTES,
];
// A pending order unconfirmed this long is abandoned → swept (frees reserved raffle numbers / bingo
// cartones, clears the queue). The per-ORDER quantity is already capped in rules; this bounds TIME.
const STALE_PENDING_DAYS = 14;
// A single buyer with more pending orders than this for ONE tool is flooding (the per-buyer rate-limit
// the rules can't express — they can't count across docs). The raffle has its own arbiter cap; this
// backstops the other kinds. Generous: a real buyer rarely has more than a couple unconfirmed at once.
const ORDER_PENDING_CAP_PER_BUYER_TOOL = 10;

/** A document-id-safe, deterministic hex digest of a string (sha256). Same primitive as auditIdOf,
 * reused for the applause ballot id (one stable id per device+pageant) and the coarse hashes. */
function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** The uids that administer a page (owner + editors) as a set — the self-dealing key. */
function principalsOf(
  data: { ownerId?: unknown; editorIds?: unknown } | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!data) return ids;
  if (typeof data.ownerId === "string") ids.add(data.ownerId);
  if (Array.isArray(data.editorIds)) {
    for (const e of data.editorIds) if (typeof e === "string") ids.add(e);
  }
  return ids;
}

/** Whether two principal sets share at least one uid (a self-dealing relationship). */
function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const id of a) if (b.has(id)) return true;
  return false;
}

/** Whether two principal sets are identical (no administrator added/removed). */
function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Millis of a possibly-null/absent Firestore Timestamp, or null. */
function tsMillis(t: unknown): number | null {
  return t && typeof (t as Timestamp).toMillis === "function"
    ? (t as Timestamp).toMillis()
    : null;
}

/**
 * Whether a write is a CONFIRMATION: `confirmedAt` is newly set (first confirm) or advanced
 * (renewal). Flag-only writes (e.g. countsForRanking) and status flips leave `confirmedAt`
 * untouched, so they're not confirmations — which is what keeps the recompute cascade from
 * re-auditing or re-thanking the same event. Shared by every confirmable ledger (subscriptions,
 * project contributions, pageant votes).
 */
function isConfirmation(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  return (
    after?.confirmedAt != null &&
    tsMillis(after.confirmedAt) !== tsMillis(before?.confirmedAt)
  );
}

/**
 * A personal record's PRIVATE subdoc ({collection}/{id}/private/data) — the donor's name and,
 * for personal donations/contributions, the magnitude (`units`/`amount`) — moved off the public
 * doc so anonymous scrapers can't deanonymize nor read how much a person gave. Read with Admin
 * privileges (the donor tier / project `raised` are computed from these). Empty object if absent.
 */
async function privateRecord(
  collectionName: string,
  docId: string,
): Promise<{ donorName?: string; buyerName?: string; units?: number; amount?: number }> {
  const snap = await db
    .collection(collectionName)
    .doc(docId)
    .collection("private")
    .doc("data")
    .get();
  return (
    (snap.data() as
      | { donorName?: string; buyerName?: string; units?: number; amount?: number }
      | undefined) ?? {}
  );
}

/**
 * The deterministic collusion signals for a confirmation, read once from the target school:
 * was it verified at confirm time, does the supporter side share an administrator with it
 * (self-dealing), and did the very uid that confirmed also run the supporter side
 * (self-confirmation — the sharpest same-identity signal).
 */
async function confirmationSignals(
  schoolId: string,
  supporterPrincipals: Set<string>,
  confirmedBy: string | null,
): Promise<{
  schoolName: string;
  schoolVerified: boolean;
  selfDealt: boolean;
  confirmerIsSupporter: boolean;
}> {
  const school = await db.collection(SCHOOLS).doc(schoolId).get();
  return {
    // Re-derived from the school doc, NOT the client-supplied denormalized label on the support
    // record (GEO-2): the supporter sets schoolName freely at create, so trusting it would let a
    // forged label pollute the admin fraud trail. The school doc is already read here for the gate,
    // so this costs no extra read.
    schoolName: (school.get("name") as string | undefined) ?? "",
    schoolVerified: school.get("verificationStatus") === "verified",
    selfDealt: intersects(supporterPrincipals, principalsOf(school.data())),
    confirmerIsSupporter: confirmedBy ? supporterPrincipals.has(confirmedBy) : false,
  };
}

/**
 * A redelivery-stable, document-id-safe audit id derived from the trigger's CloudEvent id:
 * a SHA-256 hex digest (64 chars of [0-9a-f] — always valid, never contains '/'). The raw
 * Eventarc event id is NOT guaranteed to satisfy Firestore's doc-id constraints, so we hash it.
 */
function auditIdOf(eventId: string): string {
  return sha256Hex(eventId);
}

/**
 * Append an audit row IDEMPOTENTLY, keyed by `auditId` (derived from the event id). 2nd-gen
 * Firestore triggers are AT-LEAST-ONCE: the same confirmation event can invoke this function
 * more than once, so a plain `.add()` (fresh auto-id) would mint a DUPLICATE row on redelivery.
 * `create()` on a stable id rejects with ALREADY_EXISTS (gRPC code 6) when the row already
 * exists — a redelivery — which we swallow, so exactly one row survives per logical event. A
 * genuine subscription RENEWAL is a SEPARATE write with a distinct event id, so it still gets
 * its own row. The catch lives HERE so the audit promise RESOLVES on a duplicate: letting it
 * reject would fail the whole handler and the platform would retry it forever.
 */
async function appendAuditOnce(
  auditId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.collection(AUDIT_EVENTS).doc(auditId).create(payload);
  } catch (err) {
    if ((err as { code?: number }).code === 6) return; // ALREADY_EXISTS — redelivery, no-op
    throw err; // a real failure — surface it (retried only if retry is enabled)
  }
}

/**
 * Append a non-sensitive audit event for a SUBSCRIPTION confirmation — the admin's fraud
 * pattern-review trail AND the feature store for the planned risk-scoring layer. Records WHO
 * confirmed, WHEN, the support magnitude (a COUNT), and the deterministic collusion signals —
 * NEVER the payment proof or any money figure. Names are denormalized so the admin UI renders
 * without N+1 reads. `auditEvents` has no trigger so this never cascades; firestore.rules deny
 * all client access (admin-only read, Cloud-Function-only write). Idempotent on `auditId` so an
 * at-least-once redelivery of the same confirmation doesn't double-append (see appendAuditOnce).
 */
async function recordSubscriptionAudit(
  auditId: string,
  subscriptionId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const schoolId = data.schoolId as string | undefined;
  if (!schoolId) return;
  const supporterType = (data.supporterType as string | undefined) ?? "business";
  const businessId = data.businessId as string | undefined;
  const donorId = data.donorId as string | undefined;
  const confirmedBy = (data.confirmedBy as string | undefined) ?? null;
  // Who controls the supporter side: a business's administrators, or the donating user.
  const supporterPrincipals =
    supporterType === "user"
      ? new Set(donorId ? [donorId] : [])
      : businessId
        ? principalsOf((await db.collection(BUSINESSES).doc(businessId).get()).data())
        : new Set<string>();
  // A personal donor's name + magnitude live in the private subdoc; a business carries its
  // public name + units. `units` (a COUNT, never a money figure) stays in the fraud trail.
  let supporterName: string;
  let units: number;
  if (supporterType === "user") {
    const priv = await privateRecord(SUBSCRIPTIONS, subscriptionId);
    supporterName = priv.donorName ?? "";
    units = priv.units ?? 0;
  } else {
    supporterName = (data.businessName as string | undefined) ?? "";
    units = (data.units as number) ?? 0;
  }

  await appendAuditOnce(auditId, {
    type: "subscription_confirmed",
    subscriptionId,
    supporterType,
    ...(businessId ? { businessId } : {}),
    ...(donorId ? { donorId } : {}),
    schoolId,
    // schoolName is provided by confirmationSignals below — re-derived from the school doc, not the
    // client-supplied label on this record (GEO-2).
    supporterName,
    units,
    confirmedBy,
    confirmedAt: (data.confirmedAt as Timestamp | null) ?? null,
    ...(await confirmationSignals(schoolId, supporterPrincipals, confirmedBy)),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Append a non-sensitive audit event for a PROJECT-CONTRIBUTION confirmation, mirroring
 * recordSubscriptionAudit. The supporter is always the contributing person, so the collusion
 * signals compare the donor against the school's administrators. No units/amount is stored —
 * only the relationship and the project funded.
 */
async function recordContributionAudit(
  auditId: string,
  contributionId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const schoolId = data.schoolId as string | undefined;
  const donorId = data.donorId as string | undefined;
  if (!schoolId || !donorId) return;
  const confirmedBy = (data.confirmedBy as string | undefined) ?? null;
  const supporterPrincipals = new Set([donorId]);

  await appendAuditOnce(auditId, {
    type: "project_contribution_confirmed",
    contributionId,
    supporterType: "user",
    donorId,
    schoolId,
    // schoolName is provided by confirmationSignals below — re-derived from the school doc, not the
    // client-supplied label on this record (GEO-2).
    supporterName: (await privateRecord(PROJECT_CONTRIBUTIONS, contributionId)).donorName ?? "",
    ...(data.projectId ? { projectId: data.projectId as string } : {}),
    ...(data.projectTitle ? { projectTitle: data.projectTitle as string } : {}),
    ...(data.type ? { contributionType: data.type as string } : {}),
    confirmedBy,
    confirmedAt: (data.confirmedAt as Timestamp | null) ?? null,
    ...(await confirmationSignals(schoolId, supporterPrincipals, confirmedBy)),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** A school's thank-you template config (schools/{id}/config/thanks), or null. Read with Admin
 * privileges so the detector can resolve auto-templates regardless of the public read gate. */
async function thanksConfigOf(
  schoolId: string,
): Promise<Parameters<typeof planThankYou>[2]> {
  const snap = await db
    .collection(SCHOOLS)
    .doc(schoolId)
    .collection("config")
    .doc("thanks")
    .get();
  return snap.exists
    ? (snap.data() as Parameters<typeof planThankYou>[2])
    : null;
}

/**
 * Create a thank-you row IDEMPOTENTLY, keyed by a deterministic id (`{subId}__welcome`,
 * `{subId}__renewal__{confirmedAtMs}`, `{subId}__anniv__{N}`). Like appendAuditOnce: 2nd-gen
 * triggers are at-least-once, and the daily job re-scans the same relationships, so `create()`
 * on a stable id rejects ALREADY_EXISTS (gRPC 6) for a milestone already recorded — which we
 * swallow, so exactly one thank-you survives per logical milestone. Returns whether it created.
 */
async function createThankYouOnce(
  id: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    await db.collection(THANK_YOUS).doc(id).create(payload);
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS — already thanked
    throw err;
  }
}

/** The supporter's display name for a thank-you: the business's public name, or — for a
 * personal donor — the name in the private subdoc (off the public doc). */
async function thankYouSupporterName(
  subscriptionId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const supporterType = (data.supporterType as string | undefined) ?? "business";
  if (supporterType === "user") {
    return (await privateRecord(SUBSCRIPTIONS, subscriptionId)).donorName ?? "";
  }
  return (data.businessName as string | undefined) ?? "";
}

/** Assemble a thank-you payload from a planned milestone (shared by welcome/renewal/anniversary). */
function thankYouPayload(
  data: Record<string, unknown>,
  milestone: ThankYouMilestoneKind,
  years: number | null,
  plan: ReturnType<typeof planThankYou>,
  supporterName: string,
): Record<string, unknown> {
  const supporterType = (data.supporterType as string | undefined) ?? "business";
  const businessId = data.businessId as string | undefined;
  const donorId = data.donorId as string | undefined;
  return {
    supporterType,
    ...(donorId ? { donorId } : {}),
    ...(businessId ? { businessId } : {}),
    supporterName,
    schoolId: data.schoolId as string,
    // schoolName is provided by confirmationSignals below — re-derived from the school doc, not the
    // client-supplied label on this record (GEO-2).
    milestone,
    ...(years != null ? { years } : {}),
    special: plan.special,
    status: plan.status,
    message: plan.template ? renderThankYou(plan.template.message, supporterName) : "",
    ...(plan.template?.media ? { media: plan.template.media } : {}),
    seenByDonor: false,
    // Auto-template milestones are delivered now; a prompted one is delivered when the school
    // personalizes it (sendPromptedThankYou stamps deliveredAt then).
    deliveredAt: plan.status === "sent" ? FieldValue.serverTimestamp() : null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Thank a supporter on a confirmation: a brand-new relationship is a `welcome`, a later
 * confirmation a `renewal`. Reads the school's config and decides (planThankYou) whether to
 * auto-send a template or leave a `prompted` record for the school to personalize. Generic
 * milestones with no configured template create nothing. Idempotent on a deterministic id.
 */
async function recordSubscriptionThankYou(
  subscriptionId: string,
  kind: "welcome" | "renewal",
  data: Record<string, unknown>,
): Promise<void> {
  const schoolId = data.schoolId as string | undefined;
  if (!schoolId) return;
  const plan = planThankYou(kind, 0, await thanksConfigOf(schoolId));
  if (!plan.create) return;
  const confirmedAtMs = tsMillis(data.confirmedAt) ?? 0;
  const id =
    kind === "welcome"
      ? `${subscriptionId}__welcome`
      : `${subscriptionId}__renewal__${confirmedAtMs}`;
  const supporterName = await thankYouSupporterName(subscriptionId, data);
  await createThankYouOnce(id, thankYouPayload(data, kind, null, plan, supporterName));
}

/**
 * Scan currently-supporting subscriptions for N-year anniversaries that have come due since the
 * last run and haven't been recorded yet. Anniversaries fall BETWEEN the ~90-day renewals, so
 * they can't be detected on a confirmation alone — this daily pass catches them on the right day.
 * Only the highest completed year is attempted (lower ones were created on earlier runs or
 * predate the feature). Configs are cached per school for the run; the existence pre-check skips
 * the private-name read for anniversaries already recorded (the steady state). Returns the count.
 */
async function detectAnniversaries(nowMs: number): Promise<number> {
  const snap = await db
    .collection(SUBSCRIPTIONS)
    .where("status", "in", ["confirmed", "expiring"])
    .get();
  const configCache = new Map<string, Parameters<typeof planThankYou>[2]>();
  let created = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const firstMs = tsMillis(data.firstConfirmedAt);
    if (firstMs == null) continue;
    const years = completedYears(firstMs, nowMs);
    if (years < 1) continue;
    const schoolId = data.schoolId as string | undefined;
    if (!schoolId) continue;

    let config = configCache.get(schoolId);
    if (!configCache.has(schoolId)) {
      config = await thanksConfigOf(schoolId);
      configCache.set(schoolId, config);
    }
    const plan = planThankYou("anniversary", years, config);
    if (!plan.create) continue;

    const id = `${d.id}__anniv__${years}`;
    if ((await db.collection(THANK_YOUS).doc(id).get()).exists) continue; // already thanked
    const supporterName = await thankYouSupporterName(d.id, data);
    if (await createThankYouOnce(id, thankYouPayload(data, "anniversary", years, plan, supporterName))) {
      created += 1;
    }
  }
  return created;
}

/**
 * Recompute a business's stored baseline score and cumulative donations. Uses the review
 * aggregate already stored on the doc (recomputeReviewStats keeps it current).
 *
 * Anti-fraud eligibility gate (decision #5): a subscription feeds the ranking ONLY if its
 * target school is `verified` AND does not share an administrator with the business.
 * Without the gate, a school admin who also runs a business could confirm their own
 * "support" — or stand up an unverified school — to buy free catalog visibility. Resolved
 * once per distinct school (each school doc read a single time). Ineligible support is
 * dropped from BOTH the score and totalDonated.
 */
async function recomputeBusinessRanking(businessId: string): Promise<void> {
  const ref = db.collection(BUSINESSES).doc(businessId);
  const doc = await ref.get();
  if (!doc.exists) return; // business deleted — nothing to update

  const snap = await db
    .collection(SUBSCRIPTIONS)
    .where("businessId", "==", businessId)
    .get();

  const businessPrincipals = principalsOf(doc.data());
  const schoolIds = new Set(
    snap.docs
      .map((d) => d.get("schoolId") as string | undefined)
      .filter((id): id is string => !!id),
  );
  const eligibleSchoolIds = new Set<string>();
  await Promise.all(
    [...schoolIds].map(async (schoolId) => {
      const school = await db.collection(SCHOOLS).doc(schoolId).get();
      if (!school.exists) return; // school deleted → its support stops counting
      if (school.get("verificationStatus") !== "verified") return; // verified-only gate
      // Self-dealing: business and confirming school share an owner/editor.
      if (intersects(businessPrincipals, principalsOf(school.data()))) return;
      eligibleSchoolIds.add(schoolId);
    }),
  );
  const eligibleDocs = snap.docs.filter((d) =>
    eligibleSchoolIds.has(d.get("schoolId") as string),
  );

  const nowMs = Date.now();
  const subs = eligibleDocs.map((d) => d.data() as ScorableSubscription);
  const reviewStats = doc.get("reviewStats") as ReviewStatsLike | undefined;
  const score = baselineScore(subs, reviewStats, nowMs);

  let totalDonated = 0;
  for (const d of eligibleDocs) {
    const data = d.data();
    if (data.confirmedAt) totalDonated += (data.amount as number) ?? 0;
  }

  await ref.update({
    "ranking.score": score,
    "ranking.totalDonated": totalDonated,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Denormalize the per-subscription eligibility onto each sub so the CLIENT feed re-rank
  // (which has no school data) applies the same gate — see isRankingEligible. The score
  // above stays authoritative regardless of flag freshness; this only mirrors the decision.
  // Each changed flag re-fires this trigger, which recomputes and finds the flags already
  // correct → no write → converges. Flags only flip on genuine eligibility changes (a
  // school's verification or administrators), so the steady state writes nothing.
  const flagBatch = db.batch();
  let flagWrites = 0;
  for (const d of snap.docs) {
    const eligible = eligibleSchoolIds.has(d.get("schoolId") as string);
    if (d.get("countsForRanking") !== eligible) {
      flagBatch.update(d.ref, { countsForRanking: eligible });
      flagWrites++;
    }
  }
  if (flagWrites > 0) await flagBatch.commit();
}

/**
 * Recompute a business's review aggregate from its reviews subcollection, then refresh its
 * ranking (quality Q changed). Called when a review is written.
 */
async function recomputeReviewStats(businessId: string): Promise<void> {
  const ref = db.collection(BUSINESSES).doc(businessId);
  if (!(await ref.get()).exists) return;

  const snap = await ref.collection(REVIEWS).get();
  const count = snap.size;
  let average = 0;
  if (count > 0) {
    const sum = snap.docs.reduce((acc, d) => acc + ((d.get("rating") as number) ?? 0), 0);
    average = sum / count;
  }

  await ref.update({
    reviewStats: { count, average },
    updatedAt: FieldValue.serverTimestamp(),
  });

  await recomputeBusinessRanking(businessId);
}

/**
 * Recompute a school's public support counters: distinct currently-supporting businesses,
 * and distinct currently-supporting supporters of any kind (business pages + personal
 * donors). Counts, never amounts — the platform does not publish money figures.
 */
async function recomputeSchool(schoolId: string): Promise<void> {
  const ref = db.collection(SCHOOLS).doc(schoolId);
  if (!(await ref.get()).exists) return;

  const snap = await db
    .collection(SUBSCRIPTIONS)
    .where("schoolId", "==", schoolId)
    .get();

  const nowMs = Date.now();
  const businesses = new Set<string>();
  const supporters = new Set<string>();
  for (const d of snap.docs) {
    const s = d.data() as ScorableSubscription;
    if (!isCounting(s, nowMs)) continue;
    // Prefixes keep a business id and a uid from ever colliding in the same set.
    if (s.businessId) {
      businesses.add(s.businessId);
      supporters.add(`b:${s.businessId}`);
    } else if (s.donorId) {
      supporters.add(`u:${s.donorId}`);
    }
  }

  await ref.update({
    "metrics.supportingBusinesses": businesses.size,
    "metrics.uniqueSupporters": supporters.size,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Recompute a personal donor's recognition profile from their donations. Lifetime
 * accumulation: every donation that has ever been CONFIRMED counts toward the tier, even
 * after its 90-day "active support" window lapses — recognition never decays, only the
 * school's active-supporter counters do. Runs with Admin privileges because clients can
 * never write the computed fields (see firestore.rules).
 */
async function recomputeDonorProfile(donorId: string): Promise<void> {
  const profileRef = db.collection(DONOR_PROFILES).doc(donorId);

  // A deleted donor account leaves no recognition profile. This also closes a race in the
  // account-deletion flow (deletion.ts): anonymizing a donor's donations clears their donorId and
  // re-fires this trigger; without the guard an in-flight recompute could resurrect the profile we
  // just removed. One extra read per call — negligible, and semantically correct (no user → no
  // donor profile).
  const user = await db.collection(USERS).doc(donorId).get();
  if (!user.exists) {
    if ((await profileRef.get()).exists) await profileRef.delete();
    return;
  }

  const snap = await db
    .collection(SUBSCRIPTIONS)
    .where("donorId", "==", donorId)
    .get();

  // Only confirmed donations count. `units` now lives in each donation's PRIVATE subdoc (off
  // the public doc); read it with Admin privileges — one read per confirmed donation, bounded
  // by the donor's history. The private rules freeze `units` once the school confirmed, so this
  // total can't be inflated after the fact.
  const confirmed = snap.docs.filter((d) => d.get("confirmedAt"));
  const unitsPerDonation = await Promise.all(
    confirmed.map((d) => privateRecord(SUBSCRIPTIONS, d.id).then((p) => p.units ?? 0)),
  );
  let totalUnits = 0;
  const schools = new Set<string>();
  let firstMs: number | null = null;
  let lastMs: number | null = null;
  confirmed.forEach((d, i) => {
    totalUnits += unitsPerDonation[i];
    const schoolId = d.get("schoolId") as string | undefined;
    if (schoolId) schools.add(schoolId);
    const ms = (d.get("confirmedAt") as Timestamp).toMillis();
    if (firstMs == null || ms < firstMs) firstMs = ms;
    if (lastMs == null || ms > lastMs) lastMs = ms;
  });

  const computed = {
    totalUnits,
    tier: donorTierForUnits(totalUnits),
    schoolsSupported: schools.size,
    firstConfirmedAt: firstMs == null ? null : Timestamp.fromMillis(firstMs),
    lastConfirmedAt: lastMs == null ? null : Timestamp.fromMillis(lastMs),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if ((await profileRef.get()).exists) {
    await profileRef.update(computed);
    return;
  }
  // The donate flow creates the profile before the first donation; this fallback keeps
  // totals consistent if it didn't. Defaults to private — recognition is opt-in.
  await profileRef.set({
    displayName: (user.get("name") as string | undefined) ?? "Donante",
    isPublic: false,
    ...computed,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const onSubscriptionWritten = onDocumentWritten(
  `${SUBSCRIPTIONS}/{id}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Collect affected ids from both sides (handles create/update/delete). The identity
    // fields never change in practice (rules freeze them), but unioning is cheap and safe.
    const businessIds = new Set<string>();
    const schoolIds = new Set<string>();
    const donorIds = new Set<string>();
    // Padrino subscriptions (a personal donation backing a pageant candidate) also feed that
    // candidate's padrinoCount. Collect the affected (schoolId, toolId, candidateId) triples.
    const padrinoTargets = new Map<
      string,
      { schoolId: string; toolId: string; candidateId: string }
    >();
    for (const d of [before, after]) {
      if (!d) continue;
      if (d.businessId) businessIds.add(d.businessId as string);
      if (d.schoolId) schoolIds.add(d.schoolId as string);
      if (d.donorId) donorIds.add(d.donorId as string);
      if (d.schoolId && d.pageantToolId && d.candidateId) {
        padrinoTargets.set(`${d.schoolId}/${d.pageantToolId}/${d.candidateId}`, {
          schoolId: d.schoolId as string,
          toolId: d.pageantToolId as string,
          candidateId: d.candidateId as string,
        });
      }
    }

    // Audit + thank only on a real confirmation, so the recompute cascade never re-fires either.
    const confirming = isConfirmation(before, after);
    const audit = confirming
      ? recordSubscriptionAudit(auditIdOf(event.id), event.params.id, after as Record<string, unknown>)
      : Promise.resolve();
    // Thank the supporter on this confirmation. A relationship never confirmed before is a
    // `welcome`; a later confirmation is a `renewal`. Anniversaries fall between renewals and
    // are caught by the daily job (detectAnniversaries), not here.
    const thanks = confirming
      ? recordSubscriptionThankYou(
          event.params.id,
          tsMillis(before?.confirmedAt) == null ? "welcome" : "renewal",
          after as Record<string, unknown>,
        )
      : Promise.resolve();

    await Promise.all([
      audit,
      thanks,
      ...[...businessIds].map(recomputeBusinessRanking),
      ...[...schoolIds].map(recomputeSchool),
      ...[...donorIds].map(recomputeDonorProfile),
      ...[...padrinoTargets.values()].map((t) =>
        recomputeCandidatePadrinos(t.schoolId, t.toolId, t.candidateId),
      ),
    ]);
  },
);

/**
 * Recompute a project's public funding figures from its contributions: `raised` (sum of
 * CONFIRMED money contributions) and `contributorsCount` (distinct donors with at least
 * one confirmed contribution). Money figures only — the per-person amount is never
 * published, but the aggregate `raised` is the whole point of the progress bar. Runs with
 * Admin privileges because clients can never write these fields (see firestore.rules).
 */
async function recomputeProject(
  schoolId: string,
  projectId: string,
): Promise<void> {
  const ref = db
    .collection(SCHOOLS)
    .doc(schoolId)
    .collection(PROJECTS)
    .doc(projectId);
  if (!(await ref.get()).exists) return; // project deleted — nothing to update

  const snap = await db
    .collection(PROJECT_CONTRIBUTIONS)
    .where("projectId", "==", projectId)
    .get();

  // Only confirmed contributions count. `amount` now lives in each contribution's PRIVATE
  // subdoc (off the public doc — the per-person figure is never published); read it with Admin
  // privileges, one read per confirmed contribution. Both money and in-kind carry an `amount`
  // (in-kind's is its assessed value), so both advance the bar. The private rules freeze
  // `amount` once confirmed, so `raised` can't be inflated after the fact.
  const confirmed = snap.docs.filter((d) => d.get("confirmedAt"));
  const amountPerContribution = await Promise.all(
    confirmed.map((d) =>
      privateRecord(PROJECT_CONTRIBUTIONS, d.id).then((p) => p.amount ?? 0),
    ),
  );
  let raised = 0;
  const contributors = new Set<string>();
  confirmed.forEach((d, i) => {
    raised += amountPerContribution[i];
    const donorId = d.get("donorId") as string | undefined;
    if (donorId) contributors.add(donorId);
  });

  await ref.update({
    raised,
    contributorsCount: contributors.size,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Recompute how many distinct projects a donor has contributed to with at least one
 * CONFIRMED contribution (across all schools) — backs the public "participó en N proyectos"
 * badge. Lifetime, like the donation tier: recognition never decays. Creates the profile
 * (private by default) if the donor doesn't have one yet, mirroring recomputeDonorProfile.
 */
async function recomputeDonorProjects(donorId: string): Promise<void> {
  const ref = db.collection(DONOR_PROFILES).doc(donorId);

  // A deleted donor account leaves no recognition profile — same guard + race-close as
  // recomputeDonorProfile (account deletion clears donorId and re-fires this trigger).
  const user = await db.collection(USERS).doc(donorId).get();
  if (!user.exists) {
    if ((await ref.get()).exists) await ref.delete();
    return;
  }

  const snap = await db
    .collection(PROJECT_CONTRIBUTIONS)
    .where("donorId", "==", donorId)
    .get();

  const projects = new Set<string>();
  for (const d of snap.docs) {
    const c = d.data();
    if (!c.confirmedAt) continue; // pending — the school never confirmed it
    if (c.projectId) projects.add(c.projectId as string);
  }

  if ((await ref.get()).exists) {
    await ref.update({
      projectsSupported: projects.size,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  // The fund flow creates the profile before the first contribution; this fallback keeps
  // the count consistent if it didn't. Defaults to private — recognition is opt-in.
  await ref.set({
    displayName: (user.get("name") as string | undefined) ?? "Donante",
    isPublic: false,
    totalUnits: 0,
    tier: null,
    schoolsSupported: 0,
    projectsSupported: projects.size,
    firstConfirmedAt: null,
    lastConfirmedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export const onProjectContributionWritten = onDocumentWritten(
  `${PROJECT_CONTRIBUTIONS}/{id}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Collect the affected (schoolId, projectId) pairs and donor ids from both sides
    // (handles create/update/delete). The identity fields are frozen by the rules, but
    // unioning is cheap and safe.
    const targets = new Map<string, { schoolId: string; projectId: string }>();
    const donorIds = new Set<string>();
    for (const d of [before, after]) {
      if (!d) continue;
      if (d.schoolId && d.projectId) {
        targets.set(`${d.schoolId}/${d.projectId}`, {
          schoolId: d.schoolId as string,
          projectId: d.projectId as string,
        });
      }
      if (d.donorId) donorIds.add(d.donorId as string);
    }

    // Audit a contribution confirmation. Contributions are pending → confirmed (no renewal);
    // the shared guard keeps recomputes from re-auditing.
    const audit = isConfirmation(before, after)
      ? recordContributionAudit(
          auditIdOf(event.id),
          event.params.id,
          after as Record<string, unknown>,
        )
      : Promise.resolve();

    await Promise.all([
      audit,
      ...[...targets.values()].map((t) =>
        recomputeProject(t.schoolId, t.projectId),
      ),
      ...[...donorIds].map(recomputeDonorProjects),
    ]);
  },
);

/**
 * Append a non-sensitive audit event for a PAGEANT-SUPPORT confirmation, mirroring
 * recordContributionAudit. The supporter is the backing user, so the collusion signals compare the
 * buyer against the school's administrators. Stores the support `units` (a COUNT, never money) and
 * the candidate backed — never the proof or any amount. The buyer's real name lives in the private
 * subdoc (off the public doc); read it with Admin privileges.
 */
async function recordPageantVoteAudit(
  auditId: string,
  voteId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const schoolId = data.schoolId as string | undefined;
  const buyerId = data.buyerId as string | undefined;
  if (!schoolId || !buyerId) return;
  const confirmedBy = (data.confirmedBy as string | undefined) ?? null;
  const supporterPrincipals = new Set([buyerId]);

  await appendAuditOnce(auditId, {
    type: "pageant_vote_confirmed",
    voteId,
    supporterType: "user",
    donorId: buyerId,
    schoolId,
    // schoolName is provided by confirmationSignals below — re-derived from the school doc, not the
    // client-supplied label on this record (GEO-2).
    supporterName: (await privateRecord(PAGEANT_VOTES, voteId)).buyerName ?? "",
    ...(data.toolId ? { toolId: data.toolId as string } : {}),
    ...(data.candidateId ? { candidateId: data.candidateId as string } : {}),
    ...(data.candidateName ? { candidateName: data.candidateName as string } : {}),
    units: (data.units as number | undefined) ?? 0,
    confirmedBy,
    confirmedAt: (data.confirmedAt as Timestamp | null) ?? null,
    ...(await confirmationSignals(schoolId, supporterPrincipals, confirmedBy)),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Recompute a pageant candidate's economic-support tally: `voteSupport` (sum of CONFIRMED + eligible
 * support units) and `supportCount` (distinct eligible confirmed supporters). `units` is a COUNT and
 * lives on the PUBLIC support doc, so no private read is needed (unlike a project's amount).
 *
 * Anti-fraud eligibility gate (decision #5, same as recomputeBusinessRanking): support counts ONLY
 * when the candidate's school is `verified` AND the supporter does not administer it. An unverified
 * school's support counts nothing; a school admin can't self-confirm support for their own candidate
 * to climb for free. Resolved once from the school doc. Runs with Admin privileges because clients
 * can never write these fields (firestore.rules freeze them).
 */
async function recomputePageantCandidate(
  schoolId: string,
  toolId: string,
  candidateId: string,
): Promise<void> {
  const ref = db
    .collection(SCHOOLS)
    .doc(schoolId)
    .collection(TOOLS)
    .doc(toolId)
    .collection(CANDIDATES)
    .doc(candidateId);
  if (!(await ref.get()).exists) return; // candidate deleted — nothing to update

  const school = await db.collection(SCHOOLS).doc(schoolId).get();
  const schoolVerified =
    school.exists && school.get("verificationStatus") === "verified";
  const schoolPrincipals = principalsOf(school.data());

  const snap = await db
    .collection(PAGEANT_VOTES)
    .where("candidateId", "==", candidateId)
    .get();

  let voteSupport = 0;
  const supporters = new Set<string>();
  for (const d of snap.docs) {
    if (!d.get("confirmedAt")) continue; // pending — the school never confirmed it
    if (!schoolVerified) continue; // verified-only gate (whole school)
    const buyerId = d.get("buyerId") as string | undefined;
    if (!buyerId || schoolPrincipals.has(buyerId)) continue; // self-dealing
    voteSupport += (d.get("units") as number | undefined) ?? 0;
    supporters.add(buyerId);
  }

  await ref.update({ voteSupport, supportCount: supporters.size });
}

/**
 * Recompute a pageant candidate's `padrinoCount`: distinct CURRENTLY-ACTIVE confirmed personal
 * sponsors (padrinos) backing it. A padrino is a recurring `subscriptions` donation
 * (`supporterType: 'user'`) tagged with this `pageantToolId` + `candidateId`. Same anti-fraud gate as
 * the support tally (school `verified` + the donor doesn't administer the school), with the SAME
 * "currently supporting" semantics as the school's uniqueSupporters (isCounting: confirmed/expiring,
 * not pending/expired) — a padrino badge reflects CURRENT sponsors, so a recurring sponsorship that
 * lapsed stops counting. `candidateId` lives on the PUBLIC doc, so no private read is needed.
 */
async function recomputeCandidatePadrinos(
  schoolId: string,
  toolId: string,
  candidateId: string,
): Promise<void> {
  const ref = db
    .collection(SCHOOLS)
    .doc(schoolId)
    .collection(TOOLS)
    .doc(toolId)
    .collection(CANDIDATES)
    .doc(candidateId);
  const snap = await ref.get();
  if (!snap.exists) return; // candidate deleted — nothing to update

  const school = await db.collection(SCHOOLS).doc(schoolId).get();
  const schoolVerified =
    school.exists && school.get("verificationStatus") === "verified";
  const schoolPrincipals = principalsOf(school.data());

  const subs = await db
    .collection(SUBSCRIPTIONS)
    .where("candidateId", "==", candidateId)
    .get();

  const nowMs = Date.now();
  const padrinos = new Set<string>();
  for (const d of subs.docs) {
    const s = d.data();
    if (s.pageantToolId !== toolId) continue; // belt-and-suspenders (candidateId is globally unique)
    if (!schoolVerified) continue; // verified-only gate (whole school)
    const donorId = s.donorId as string | undefined;
    if (!donorId || schoolPrincipals.has(donorId)) continue; // self-dealing
    if (!isCounting(s as ScorableSubscription, nowMs)) continue; // currently-active confirmed
    padrinos.add(donorId);
  }

  const padrinoCount = padrinos.size;
  if (snap.get("padrinoCount") === padrinoCount) return; // already current — no write
  await ref.update({ padrinoCount });
}

export const onPageantVoteWritten = onDocumentWritten(
  `${PAGEANT_VOTES}/{id}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Collect the affected (schoolId, toolId, candidateId) triples from both sides (handles
    // create/update/delete). The identity fields are frozen by the rules, but unioning is cheap.
    const targets = new Map<
      string,
      { schoolId: string; toolId: string; candidateId: string }
    >();
    for (const d of [before, after]) {
      if (!d) continue;
      if (d.schoolId && d.toolId && d.candidateId) {
        targets.set(`${d.schoolId}/${d.toolId}/${d.candidateId}`, {
          schoolId: d.schoolId as string,
          toolId: d.toolId as string,
          candidateId: d.candidateId as string,
        });
      }
    }

    // Audit a support confirmation. Support is pending → confirmed (no renewal); the shared
    // guard keeps the recompute cascade from re-auditing.
    const audit = isConfirmation(before, after)
      ? recordPageantVoteAudit(
          auditIdOf(event.id),
          event.params.id,
          after as Record<string, unknown>,
        )
      : Promise.resolve();

    await Promise.all([
      audit,
      ...[...targets.values()].map((t) =>
        recomputePageantCandidate(t.schoolId, t.toolId, t.candidateId),
      ),
    ]);
  },
);

/**
 * Cast a free "simpatía" applause for a pageant candidate — the ONLY path for an accountless,
 * unauthenticated visitor, since the applause ledger is closed to all clients (rules `if false`).
 * Clone of trackInteraction's shape (onRequest + cors), hardened for a vote that WEIGHS on the crown:
 *
 * - **App Check is mandatory.** A missing/invalid `X-Firebase-AppCheck` token is rejected (401). It
 *   is the bot wall for an accountless vote; the sympathy axis must never be scriptable. Until App
 *   Check is configured + proven in prod, `freeVotingEnabled` stays off so the UI never reaches this
 *   path — the enforcement here is the backstop.
 * - **Server-side gate.** The target school must be `verified`, the tool an `active` pageant with
 *   `config.freeVotingEnabled == true`, the candidate must exist, and (if set) `now` must fall inside
 *   the `opensAt..closesAt` window. Re-checked here so a patched client can't bypass the school's
 *   switch. (The live-event `phase == 'voting'` check arrives with the coronación slice.)
 * - **One vote per device per pageant.** The ballot id is deterministic — `sha256(toolId+voterKey)`,
 *   where `voterKey` is the caller's stable localStorage handle — so a re-tap hits the same doc:
 *   `create()` rejects ALREADY_EXISTS (gRPC 6), mapped to 409, and the vote stays locked to the first
 *   candidate chosen. `ipHash` is stored coarse for a future per-IP rate-cap (deferred).
 */
export const castPageantApplause = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const appCheckToken = req.header("X-Firebase-AppCheck");
  if (!appCheckToken) {
    res.status(401).end();
    return;
  }
  try {
    // consume: true makes the token SINGLE-USE (replay protection): the client mints a fresh
    // LIMITED-use token per applause (lib/firebase.ts getAppCheckToken), so one token backs exactly
    // one ballot and a harvested token can't be replayed across rotating voterKeys to stuff the
    // sympathy tally (#N3). Needs the Firebase App Check API enabled (auto-enabled when the app is
    // registered in App Check — see docs/pageant-free-vote-golive.md). A failure here is rejected as
    // 401 exactly like an invalid token; the whole free-vote layer is dormant (the client sends no
    // token without a configured site key) until that go-live, so this never fires before then.
    const appCheck = await getAppCheck().verifyToken(appCheckToken, {
      consume: true,
    });
    if (appCheck.alreadyConsumed) {
      res.status(401).end(); // replayed/consumed token — not a fresh single-use vote
      return;
    }
  } catch {
    res.status(401).end();
    return;
  }

  const parsed = parseBeaconBody(req);
  if (!parsed.ok) {
    res.status(400).end();
    return;
  }
  const { schoolId, toolId, candidateId, voterKey } = (parsed.payload ?? {}) as {
    schoolId?: unknown;
    toolId?: unknown;
    candidateId?: unknown;
    voterKey?: unknown;
  };
  if (
    typeof schoolId !== "string" ||
    !DOC_ID_RE.test(schoolId) ||
    typeof toolId !== "string" ||
    !DOC_ID_RE.test(toolId) ||
    typeof candidateId !== "string" ||
    !DOC_ID_RE.test(candidateId) ||
    typeof voterKey !== "string" ||
    voterKey.length < 8 ||
    voterKey.length > 200
  ) {
    res.status(400).end();
    return;
  }

  const toolRef = db
    .collection(SCHOOLS)
    .doc(schoolId)
    .collection(TOOLS)
    .doc(toolId);
  const [schoolSnap, toolSnap, candSnap] = await Promise.all([
    db.collection(SCHOOLS).doc(schoolId).get(),
    toolRef.get(),
    toolRef.collection(CANDIDATES).doc(candidateId).get(),
  ]);

  const config =
    (toolSnap.get("config") as Record<string, unknown> | undefined) ?? {};
  const nowMs = Date.now();
  const opensMs = tsMillis(config.opensAt);
  const closesMs = tsMillis(config.closesAt);
  if (
    !schoolSnap.exists ||
    schoolSnap.get("verificationStatus") !== "verified" ||
    !toolSnap.exists ||
    toolSnap.get("type") !== "pageant" ||
    toolSnap.get("status") !== "active" ||
    config.freeVotingEnabled !== true ||
    !candSnap.exists ||
    (opensMs != null && nowMs < opensMs) ||
    (closesMs != null && nowMs > closesMs)
  ) {
    res.status(403).end();
    return;
  }

  const ballotId = sha256Hex(`${toolId}:${voterKey}`);
  try {
    await toolRef.collection(APPLAUSE).doc(ballotId).create({
      candidateId,
      voterKeyHash: sha256Hex(voterKey),
      ipHash: sha256Hex(req.ip ?? ""),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 6) {
      res.status(409).end(); // ALREADY_EXISTS — this device already applauded; no double count
      return;
    }
    logger.debug("castPageantApplause dropped", { schoolId, toolId, err });
    res.status(500).end();
    return;
  }
  res.status(204).end();
});

/**
 * Recompute a candidate's free "simpatía" tally: `voteFree = COUNT(applause ballots for X)`. A COUNT
 * aggregation makes the recompute idempotent under the trigger's at-least-once redelivery (unlike an
 * increment). Skips the write when already current — candidate writes have no trigger, so this never
 * cascades, but the skip keeps it quiet. Returns nothing.
 */
async function recomputeCandidateApplause(
  schoolId: string,
  toolId: string,
  candidateId: string,
): Promise<void> {
  const toolRef = db
    .collection(SCHOOLS)
    .doc(schoolId)
    .collection(TOOLS)
    .doc(toolId);
  const ref = toolRef.collection(CANDIDATES).doc(candidateId);
  const snap = await ref.get();
  if (!snap.exists) return; // candidate deleted — nothing to update

  const agg = await toolRef
    .collection(APPLAUSE)
    .where("candidateId", "==", candidateId)
    .count()
    .get();
  const voteFree = agg.data().count;

  if (snap.get("voteFree") === voteFree) return; // already current — no write
  await ref.update({ voteFree });
}

export const onApplauseWritten = onDocumentWritten(
  `${SCHOOLS}/{schoolId}/${TOOLS}/{toolId}/${APPLAUSE}/{ballotId}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Union the candidateId from both sides so a (rare) ballot move or delete re-tallies both.
    const candidateIds = new Set<string>();
    for (const d of [before, after]) {
      if (d?.candidateId) candidateIds.add(d.candidateId as string);
    }
    const { schoolId, toolId } = event.params;

    await Promise.all(
      [...candidateIds].map((cid) =>
        recomputeCandidateApplause(schoolId, toolId, cid),
      ),
    );
  },
);

export const onReviewWritten = onDocumentWritten(
  `${BUSINESSES}/{businessId}/${REVIEWS}/{userId}`,
  async (event) => {
    await recomputeReviewStats(event.params.businessId);
  },
);

/**
 * Recompute a category's `businessCount`: the number of ACTIVE businesses listing it. Backs
 * the count shown on /categories and the `businessCount > 0` filter that decides which
 * category chips the home row surfaces — both go stale the moment a business is created,
 * recategorized, or changes status, which the client can't fix (rules limit `categories`
 * writes to a category to admins). Uses a server-side count() aggregation (no per-business
 * read) and skips the write when already current. `categories` has no trigger, so this never
 * cascades.
 */
async function recomputeCategoryCount(categoryId: string): Promise<void> {
  const ref = db.collection(CATEGORIES).doc(categoryId);
  const doc = await ref.get();
  if (!doc.exists) return; // category deleted — nothing to update

  const agg = await db
    .collection(BUSINESSES)
    .where("categories", "array-contains", categoryId)
    .where("status", "==", "active")
    .count()
    .get();
  const businessCount = agg.data().count;

  if (doc.get("businessCount") === businessCount) return; // already current — no write
  await ref.update({ businessCount });
}

export const onBusinessWritten = onDocumentWritten(
  `${BUSINESSES}/{id}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Affected categories = union of the business's categories on both sides, so adding a
    // category, removing one, deleting the business, or flipping its status (active ⇄ draft/
    // pending/suspended) all recount the right categories. The count query filters to active,
    // so a business leaving the active set correctly drops out of the total.
    const categoryIds = new Set<string>();
    for (const d of [before, after]) {
      const cats = d?.categories;
      if (Array.isArray(cats)) {
        for (const c of cats) if (typeof c === "string") categoryIds.add(c);
      }
    }
    if (categoryIds.size === 0) return;

    await Promise.all([...categoryIds].map(recomputeCategoryCount));
  },
);

/**
 * A category rename leaves the denormalized `categoryNames` copied onto every business in that
 * category stale (the membership match is by id, so listings never break — only the copied label).
 * No client can maintain that cross-collection denorm (the write is admin-only, and rules can't
 * iterate/aggregate), so re-denormalize here: on a NAME change, rebuild `categoryNames` from the
 * CURRENT category names for every business carrying this category. Only `name` matters —
 * icon/order/businessCount changes don't touch the label. A delete is left alone (a business keeps
 * the stale label until re-saved or the category is removed from it). The categoryNames write
 * doesn't change a business's `categories`, so onBusinessWritten's count recompute no-ops on it and
 * this never cascades.
 */
export const onCategoryWritten = onDocumentWritten(
  `${CATEGORIES}/{id}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return; // deleted — nothing to re-denormalize
    const newName = (after.name as string | undefined) ?? "";
    if ((before?.name as string | undefined) === newName) return; // only a rename matters

    const categoryId = event.params.id;
    const members = await db
      .collection(BUSINESSES)
      .where("categories", "array-contains", categoryId)
      .get();
    if (members.empty) return;

    // Build the id→name map once: a business in several categories needs ALL of its labels rebuilt
    // (in its own categories[] order), not just the renamed one.
    const cats = await db.collection(CATEGORIES).get();
    const nameById = new Map<string, string>();
    for (const c of cats.docs) nameById.set(c.id, (c.get("name") as string) ?? "");

    const tasks = members.docs.map((b) => () => {
      const ids = (b.get("categories") as unknown[]) ?? [];
      const categoryNames = ids.map((id) =>
        typeof id === "string" ? (nameById.get(id) ?? "") : "",
      );
      const current = b.get("categoryNames");
      if (
        Array.isArray(current) &&
        current.length === categoryNames.length &&
        current.every((v, i) => v === categoryNames[i])
      ) {
        return Promise.resolve(); // already current — skip the write
      }
      return b.ref.update({ categoryNames });
    });
    await runInChunks(tasks);
  },
);

/**
 * A school's verification status and its administrators feed the anti-fraud eligibility
 * gate in recomputeBusinessRanking (verified-only + no self-dealing). Both can change with
 * no subscription being written — admin approves the school, or an owner adds/removes an
 * editor — so onSubscriptionWritten wouldn't fire. When they do, recompute every business
 * supporting this school AND every pageant candidate of this school (their voteSupport tally gates
 * the same way). Every other school write (name, photos, and the
 * metrics.* fields recomputeSchool itself writes) is ignored, so this never fans out on its
 * own metric updates.
 */
export const onSchoolWritten = onDocumentWritten(
  `${SCHOOLS}/{id}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const verificationChanged =
      before?.verificationStatus !== after?.verificationStatus;
    const principalsChanged = !sameSet(
      principalsOf(before),
      principalsOf(after),
    );
    if (!verificationChanged && !principalsChanged) return;

    const schoolId = event.params.id;

    // Businesses supporting this school: their ranking gates on the school's verification + admins.
    const snap = await db
      .collection(SUBSCRIPTIONS)
      .where("schoolId", "==", schoolId)
      .get();
    const businessIds = new Set<string>();
    for (const d of snap.docs) {
      const businessId = d.get("businessId") as string | undefined;
      if (businessId) businessIds.add(businessId);
    }

    // Pageant candidates of this school gate the SAME way, and no pageantVote write fires when the
    // school's verification/admins change — so re-tally them here too.
    const toolsSnap = await db
      .collection(SCHOOLS)
      .doc(schoolId)
      .collection(TOOLS)
      .where("type", "==", "pageant")
      .get();
    // Fan the per-tool candidate reads out in parallel, not one round trip at a time.
    const candSnaps = await Promise.all(
      toolsSnap.docs.map((tool) => tool.ref.collection(CANDIDATES).get()),
    );
    // Collect every recompute as a THUNK so runInChunks can bound the concurrency (N9) — a school
    // with thousands of supporters/candidates would otherwise fire them all at once.
    const tasks: (() => Promise<unknown>)[] = [...businessIds].map(
      (businessId) => () => recomputeBusinessRanking(businessId),
    );
    toolsSnap.docs.forEach((tool, i) => {
      for (const cand of candSnaps[i].docs) {
        // Both tallies gate the same way (verified + no self-dealing), so re-verification flips
        // both: the economic support tally AND the recurring-padrino count.
        tasks.push(
          () => recomputePageantCandidate(schoolId, tool.id, cand.id),
          () => recomputeCandidatePadrinos(schoolId, tool.id, cand.id),
        );
      }
    });

    await runInChunks(tasks);
  },
);

export const expireSubscriptionsDaily = onSchedule(
  "every day 03:00",
  async () => {
    const now = Timestamp.now();
    const window = Timestamp.fromMillis(
      now.toMillis() + EXPIRING_WINDOW_DAYS * DAY_MS,
    );

    // Lapsed: confirmed/expiring past their expiry → expired.
    const lapsed = await db
      .collection(SUBSCRIPTIONS)
      .where("status", "in", ["confirmed", "expiring"])
      .where("expiresAt", "<=", now)
      .get();

    // Near expiry: confirmed within the renewal window → expiring (a nudge; still counts).
    const nearing = await db
      .collection(SUBSCRIPTIONS)
      .where("status", "==", "confirmed")
      .where("expiresAt", ">", now)
      .where("expiresAt", "<=", window)
      .get();

    // Recompute happens via the onSubscriptionWritten trigger these status writes re-fire. A single
    // batch is capped at 500 writes, so chunk it (N9) — once the catalog outgrows one batch an
    // unchunked commit would throw and the whole daily sweep would fail. 450 leaves headroom.
    const updates = [
      ...lapsed.docs.map((d) => ({ ref: d.ref, status: "expired" })),
      ...nearing.docs.map((d) => ({ ref: d.ref, status: "expiring" })),
    ];
    const BATCH_LIMIT = 450;
    for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const u of updates.slice(i, i + BATCH_LIMIT)) {
        batch.update(u.ref, {
          status: u.status,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    // Same daily pass thanks supporters whose N-year anniversary came due since yesterday —
    // these fall between the ~90-day renewals, so the confirmation trigger can't catch them.
    const anniversaries = await detectAnniversaries(now.toMillis());

    logger.info("expireSubscriptionsDaily", {
      expired: lapsed.size,
      expiring: nearing.size,
      anniversaries,
    });
  },
);

/**
 * Daily hygiene for UNCONFIRMED orders across every buyable kind (raffle/product/bingo/pageantVote).
 * Two sweeps, both deleting the public order doc AND its private subdoc:
 *  - STALE (residual "stale-pending expiry"): a pending order unconfirmed for > STALE_PENDING_DAYS is
 *    abandoned. Deleting it frees any reserved inventory — a raffle's numbers and a bingo lote's
 *    availability are derived from the still-PENDING orders — and clears the school's queue (the buyer
 *    or school could delete it manually; this is the automatic backstop).
 *  - PER-BUYER CAP (residual "non-raffle per-buyer rate-limit", + the bingo cross-order grid-lock): a
 *    buyer with more than ORDER_PENDING_CAP_PER_BUYER_TOOL pending orders for ONE tool is flooding —
 *    the per-buyer limit the rules can't express (they can't count across docs). Delete their NEWEST
 *    excess, keeping the oldest CAP (closest to a real confirmation). A SOFT, daily bound: the
 *    per-order quantity is already capped in rules, the raffle has its own arbiter cap, and the school
 *    self-moderates — this just stops a sustained pile-up from locking a grid indefinitely.
 * Queries only by `status` (a single-field index, no composite needed) and filters age/grouping in
 * memory — pending orders are few. The Storage proof file, if any, is left: a small orphan a Storage
 * lifecycle rule can reap (deleting it here would need a per-file Storage call per order).
 */
export const expirePendingOrdersDaily = onSchedule(
  "every day 03:30",
  async () => {
    const cutoffMs = Timestamp.now().toMillis() - STALE_PENDING_DAYS * DAY_MS;
    let stale = 0;
    let flood = 0;

    for (const coll of ORDER_COLLECTIONS) {
      const pending = (
        await db.collection(coll).where("status", "==", "pending").get()
      ).docs;

      const doomed = new Set<string>();
      const fresh: QueryDocumentSnapshot[] = [];
      for (const d of pending) {
        const created = d.get("createdAt") as Timestamp | undefined;
        if (created != null && created.toMillis() <= cutoffMs) {
          doomed.add(d.id);
          stale++;
        } else {
          fresh.push(d);
        }
      }

      // Per-(buyer, tool) cap among the still-fresh ones. buyerId is a Firebase uid and toolId a
      // Firestore auto-id (both alphanumeric), so '|' is a collision-proof composite-key separator.
      const groups = new Map<string, QueryDocumentSnapshot[]>();
      for (const d of fresh) {
        const key = `${d.get("buyerId") ?? ""}|${d.get("toolId") ?? ""}`;
        const arr = groups.get(key);
        if (arr) arr.push(d);
        else groups.set(key, [d]);
      }
      for (const docs of groups.values()) {
        if (docs.length <= ORDER_PENDING_CAP_PER_BUYER_TOOL) continue;
        docs.sort(
          (a, b) =>
            ((a.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0) -
            ((b.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0),
        );
        for (const d of docs.slice(ORDER_PENDING_CAP_PER_BUYER_TOOL)) {
          doomed.add(d.id);
          flood++;
        }
      }

      // Delete the public doc + its private subdoc for each doomed order; chunk under the 500-write
      // batch limit (2 writes per order).
      const refs: DocumentReference[] = [];
      for (const id of doomed) {
        refs.push(db.collection(coll).doc(id));
        refs.push(db.collection(coll).doc(id).collection("private").doc("data"));
      }
      const BATCH_LIMIT = 450;
      for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
        await batch.commit();
      }
    }

    logger.info("expirePendingOrdersDaily", { stale, flood });
  },
);
