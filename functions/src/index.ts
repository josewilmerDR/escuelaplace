/**
 * Cloud Functions (Gen 2) that maintain the denormalized ranking signals across the
 * permission boundary the client SDK cannot cross.
 *
 * Why these run server-side: when a SCHOOL board confirms a subscription, the signed-in
 * user is the school's owner — who is NOT allowed to write the BUSINESS document (rules
 * limit that to the business owner/editor or admin). So recomputing the business's
 * `ranking.score` must happen with Admin privileges, here.
 *
 * - onSubscriptionWritten: recompute the affected business's baseline score + totalDonated
 *   and the affected school's supportingBusinesses, on any subscription create/update/delete.
 * - expireSubscriptionsDaily: time-decay the lifecycle — flip lapsed subscriptions to
 *   `expired` and near-expiry ones to `expiring`. The status writes re-fire the trigger
 *   above, which recomputes the affected docs.
 */
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  EXPIRING_WINDOW_DAYS,
  type ReviewStatsLike,
  type ScorableSubscription,
  baselineScore,
  isCounting,
} from "./ranking";

initializeApp();
const db = getFirestore();

const DAY_MS = 86_400_000;
const SUBSCRIPTIONS = "subscriptions";
const BUSINESSES = "businesses";
const SCHOOLS = "schools";
const REVIEWS = "reviews";

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

/** Recompute a school's count of currently-supporting (distinct) businesses. */
async function recomputeSchool(schoolId: string): Promise<void> {
  const ref = db.collection(SCHOOLS).doc(schoolId);
  if (!(await ref.get()).exists) return;

  const snap = await db
    .collection(SUBSCRIPTIONS)
    .where("schoolId", "==", schoolId)
    .get();

  const nowMs = Date.now();
  const businesses = new Set<string>();
  for (const d of snap.docs) {
    const s = d.data() as ScorableSubscription;
    if (isCounting(s, nowMs)) businesses.add(s.businessId);
  }

  await ref.update({
    "metrics.supportingBusinesses": businesses.size,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export const onSubscriptionWritten = onDocumentWritten(
  `${SUBSCRIPTIONS}/{id}`,
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Collect affected ids from both sides (handles create/update/delete). businessId and
    // schoolId never change in practice, but unioning is cheap and safe.
    const businessIds = new Set<string>();
    const schoolIds = new Set<string>();
    for (const d of [before, after]) {
      if (!d) continue;
      if (d.businessId) businessIds.add(d.businessId as string);
      if (d.schoolId) schoolIds.add(d.schoolId as string);
    }

    await Promise.all([
      ...[...businessIds].map(recomputeBusinessRanking),
      ...[...schoolIds].map(recomputeSchool),
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
