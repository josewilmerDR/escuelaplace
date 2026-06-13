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

/**
 * Recompute a business's stored baseline score and cumulative donations. Uses the review
 * aggregate already stored on the doc (recomputeReviewStats keeps it current).
 */
async function recomputeBusinessRanking(businessId: string): Promise<void> {
  const ref = db.collection(BUSINESSES).doc(businessId);
  const doc = await ref.get();
  if (!doc.exists) return; // business deleted — nothing to update

  const snap = await db
    .collection(SUBSCRIPTIONS)
    .where("businessId", "==", businessId)
    .get();

  const nowMs = Date.now();
  const subs = snap.docs.map((d) => d.data() as ScorableSubscription);
  const reviewStats = doc.get("reviewStats") as ReviewStatsLike | undefined;
  const score = baselineScore(subs, reviewStats, nowMs);

  let totalDonated = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.confirmedAt) totalDonated += (data.amount as number) ?? 0;
  }

  await ref.update({
    "ranking.score": score,
    "ranking.totalDonated": totalDonated,
    updatedAt: FieldValue.serverTimestamp(),
  });
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

    await Promise.all([
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
