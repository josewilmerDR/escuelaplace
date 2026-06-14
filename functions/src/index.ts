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
 *   The business ranking applies an anti-fraud eligibility gate (verified school + no
 *   self-dealing) — see recomputeBusinessRanking. On a confirmation it also appends a
 *   non-sensitive audit event (auditEvents) for fraud review / the risk-scoring feature store.
 * - onSchoolWritten: when a school's verification status or its administrators change (both
 *   feed that eligibility gate), recompute every business supporting it — those changes
 *   don't touch any subscription, so the trigger above wouldn't fire on its own.
 * - expireSubscriptionsDaily: time-decay the lifecycle — flip lapsed subscriptions to
 *   `expired` and near-expiry ones to `expiring`. The status writes re-fire the trigger
 *   above, which recomputes the affected docs.
 * - trackInteraction (./track): unauthenticated view/click counters for the funnel
 *   report — anonymous buyers can't write Firestore directly.
 * - recordWalkIn (./track): manager-only counter of walk-in customers who mentioned
 *   escuelaplace at the counter.
 */
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { donorTierForUnits } from "./donors";
import {
  EXPIRING_WINDOW_DAYS,
  type ReviewStatsLike,
  type ScorableSubscription,
  baselineScore,
  isCounting,
} from "./ranking";

initializeApp();
const db = getFirestore();

export { recordWalkIn, trackInteraction } from "./track";

const DAY_MS = 86_400_000;
const SUBSCRIPTIONS = "subscriptions";
const BUSINESSES = "businesses";
const SCHOOLS = "schools";
const REVIEWS = "reviews";
const DONOR_PROFILES = "donorProfiles";
const USERS = "users";
const PROJECTS = "projects";
const PROJECT_CONTRIBUTIONS = "projectContributions";
const AUDIT_EVENTS = "auditEvents";

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
 * Append a non-sensitive audit event for a confirmation — the admin's fraud pattern-review
 * trail AND the feature store for the planned risk-scoring layer. Records WHO confirmed,
 * WHEN, the support magnitude (a COUNT), and the deterministic collusion signals
 * (self-dealing, self-confirmation) — NEVER the payment proof or any money figure. The
 * `auditEvents` collection has no trigger, so this write never cascades; firestore.rules
 * deny all client access (admin-only read, Cloud-Function-only write).
 */
async function recordConfirmationAudit(
  subscriptionId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const schoolId = data.schoolId as string | undefined;
  if (!schoolId) return;
  const supporterType = (data.supporterType as string | undefined) ?? "business";
  const businessId = data.businessId as string | undefined;
  const donorId = data.donorId as string | undefined;
  const confirmedBy = (data.confirmedBy as string | undefined) ?? null;

  const school = await db.collection(SCHOOLS).doc(schoolId).get();
  // Who controls the supporter side: a business's administrators, or the donating user.
  const supporterPrincipals =
    supporterType === "user"
      ? new Set(donorId ? [donorId] : [])
      : businessId
        ? principalsOf((await db.collection(BUSINESSES).doc(businessId).get()).data())
        : new Set<string>();
  const schoolPrincipals = principalsOf(school.data());

  await db.collection(AUDIT_EVENTS).add({
    type: "subscription_confirmed",
    subscriptionId,
    supporterType,
    ...(businessId ? { businessId } : {}),
    ...(donorId ? { donorId } : {}),
    schoolId,
    units: (data.units as number) ?? 0,
    confirmedBy,
    confirmedAt: (data.confirmedAt as Timestamp | null) ?? null,
    schoolVerified: school.get("verificationStatus") === "verified",
    selfDealt: intersects(supporterPrincipals, schoolPrincipals),
    confirmerIsSupporter: confirmedBy ? supporterPrincipals.has(confirmedBy) : false,
    createdAt: FieldValue.serverTimestamp(),
  });
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
  const snap = await db
    .collection(SUBSCRIPTIONS)
    .where("donorId", "==", donorId)
    .get();

  let totalUnits = 0;
  const schools = new Set<string>();
  let firstMs: number | null = null;
  let lastMs: number | null = null;
  for (const d of snap.docs) {
    const data = d.data();
    const confirmedAt = data.confirmedAt as Timestamp | null;
    if (!confirmedAt) continue; // pending — the school never confirmed it
    totalUnits += (data.units as number) ?? 0;
    if (data.schoolId) schools.add(data.schoolId as string);
    const ms = confirmedAt.toMillis();
    if (firstMs == null || ms < firstMs) firstMs = ms;
    if (lastMs == null || ms > lastMs) lastMs = ms;
  }

  const computed = {
    totalUnits,
    tier: donorTierForUnits(totalUnits),
    schoolsSupported: schools.size,
    firstConfirmedAt: firstMs == null ? null : Timestamp.fromMillis(firstMs),
    lastConfirmedAt: lastMs == null ? null : Timestamp.fromMillis(lastMs),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = db.collection(DONOR_PROFILES).doc(donorId);
  if ((await ref.get()).exists) {
    await ref.update(computed);
    return;
  }
  // The donate flow creates the profile before the first donation; this fallback keeps
  // totals consistent if it didn't. Defaults to private — recognition is opt-in.
  const user = await db.collection(USERS).doc(donorId).get();
  await ref.set({
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
    for (const d of [before, after]) {
      if (!d) continue;
      if (d.businessId) businessIds.add(d.businessId as string);
      if (d.schoolId) schoolIds.add(d.schoolId as string);
      if (d.donorId) donorIds.add(d.donorId as string);
    }

    // Audit a confirmation: `confirmedAt` newly set (first confirm) or advanced (renewal).
    // Flag-only writes (countsForRanking) and expiry status flips leave confirmedAt
    // untouched, so they record nothing — no duplicate events from the recompute cascade.
    const audit =
      after?.confirmedAt != null &&
      tsMillis(after.confirmedAt) !== tsMillis(before?.confirmedAt)
        ? recordConfirmationAudit(event.params.id, after)
        : Promise.resolve();

    await Promise.all([
      audit,
      ...[...businessIds].map(recomputeBusinessRanking),
      ...[...schoolIds].map(recomputeSchool),
      ...[...donorIds].map(recomputeDonorProfile),
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

  let raised = 0;
  const contributors = new Set<string>();
  for (const d of snap.docs) {
    const c = d.data();
    if (!c.confirmedAt) continue; // pending — the school never confirmed it
    // Both money and in-kind carry an `amount` in the project's currency (in-kind's is its
    // assessed value), so both advance the bar — one flow, not two.
    raised += (c.amount as number) ?? 0;
    if (c.donorId) contributors.add(c.donorId as string);
  }

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

  const ref = db.collection(DONOR_PROFILES).doc(donorId);
  if ((await ref.get()).exists) {
    await ref.update({
      projectsSupported: projects.size,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  // The fund flow creates the profile before the first contribution; this fallback keeps
  // the count consistent if it didn't. Defaults to private — recognition is opt-in.
  const user = await db.collection(USERS).doc(donorId).get();
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

    await Promise.all([
      ...[...targets.values()].map((t) =>
        recomputeProject(t.schoolId, t.projectId),
      ),
      ...[...donorIds].map(recomputeDonorProjects),
    ]);
  },
);

export const onReviewWritten = onDocumentWritten(
  `${BUSINESSES}/{businessId}/${REVIEWS}/{userId}`,
  async (event) => {
    await recomputeReviewStats(event.params.businessId);
  },
);

/**
 * A school's verification status and its administrators feed the anti-fraud eligibility
 * gate in recomputeBusinessRanking (verified-only + no self-dealing). Both can change with
 * no subscription being written — admin approves the school, or an owner adds/removes an
 * editor — so onSubscriptionWritten wouldn't fire. When they do, recompute every business
 * supporting this school. Every other school write (name, photos, and the
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

    const snap = await db
      .collection(SUBSCRIPTIONS)
      .where("schoolId", "==", event.params.id)
      .get();
    const businessIds = new Set<string>();
    for (const d of snap.docs) {
      const businessId = d.get("businessId") as string | undefined;
      if (businessId) businessIds.add(businessId);
    }
    await Promise.all([...businessIds].map(recomputeBusinessRanking));
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

    // Recompute happens via the onSubscriptionWritten trigger these status writes re-fire.
    // NOTE: a single batch is capped at 500 writes; chunk this if the catalog outgrows it.
    const batch = db.batch();
    lapsed.forEach((d) =>
      batch.update(d.ref, {
        status: "expired",
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    nearing.forEach((d) =>
      batch.update(d.ref, {
        status: "expiring",
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    await batch.commit();

    logger.info("expireSubscriptionsDaily", {
      expired: lapsed.size,
      expiring: nearing.size,
    });
  },
);
