/**
 * Client side of the funnel counters. The write side lives in functions/src/track.ts:
 * trackInteraction (anonymous profile events) and recordWalkIn (manager-only walk-in
 * counter) increment lifetime counters on the business doc plus the
 * `businesses/{id}/metricsDaily/{YYYY-MM-DD}` series this module reads. Rules restrict
 * these reads to the business's owner/editors/admin — the report is private and never
 * feeds the public ranking.
 */
import {
  collection,
  documentId,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, getFirebaseFunctions } from "@/lib/firebase";
import type { BusinessDailyMetrics } from "@/types";

const BUSINESSES = "businesses";
const METRICS_DAILY = "metricsDaily";

/** A daily metrics doc with its day key (the doc id, YYYY-MM-DD in CR time). */
export type DailyMetricsDoc = BusinessDailyMetrics & { day: string };

/** Daily metric docs whose day key (the doc id) falls in [fromDay, toDay], ascending. */
export async function getBusinessDailyMetrics(
  businessId: string,
  fromDay: string,
  toDay: string,
): Promise<DailyMetricsDoc[]> {
  const q = query(
    collection(db, BUSINESSES, businessId, METRICS_DAILY),
    orderBy(documentId()),
    startAt(fromDay),
    endAt(toDay),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    day: d.id,
    ...(d.data() as BusinessDailyMetrics),
  }));
}

/** Result of recording a walk-in: the day it landed on (CR time) and that day's count. */
export interface WalkInResult {
  day: string;
  walkIns: number;
}

/**
 * Record (delta +1) or undo (delta -1) a walk-in customer who mentioned escuelaplace
 * at the counter. Routed through an authenticated callable so the series stays
 * single-writer (the client can't write metricsDaily) and only the business's
 * owner/editors or admin can count — that exclusivity is the metric's credibility.
 */
export async function recordWalkIn(
  businessId: string,
  delta: 1 | -1 = 1,
): Promise<WalkInResult> {
  const call = httpsCallable<{ businessId: string; delta: number }, WalkInResult>(
    getFirebaseFunctions(),
    "recordWalkIn",
  );
  return (await call({ businessId, delta })).data;
}
