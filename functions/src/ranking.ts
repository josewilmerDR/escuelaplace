/**
 * Baseline ranking math for the server side (Cloud Functions).
 *
 * SOURCE OF TRUTH: `lib/firestore/ranking.ts` in the web app. Keep the weights and the
 * formula in sync with that file. This copy is intentionally dependency-free (no firebase
 * client SDK) and works with admin Timestamps through the structural `{ toMillis() }`
 * shape, so it can run in the functions runtime.
 *
 * What gets persisted is the mission-GENERAL baseline (no user community):
 *   S = 1 + b_i·I + b_q·Q     (community set empty, so C = 0)
 * The web client re-ranks per user on top of this stored baseline (it boosts businesses
 * that support the user's community). If weights ever drift between the two copies, only
 * the server-rendered order is slightly off; the client corrects it on hydration.
 */
const DAY_MS = 86_400_000;

/** Mirror of DEFAULT_RANKING_WEIGHTS in lib/firestore/ranking.ts. */
export const RANKING_WEIGHTS = {
  bc: 1.0,
  bi: 0.4,
  bq: 0.3,
  saturationUnits: 10,
  halfLifeDays: 180,
  reviewSaturationCount: 5,
};

/** Mirror of SUBSCRIPTION_EXPIRING_WINDOW_DAYS in types/firestore.ts. */
export const EXPIRING_WINDOW_DAYS = 14;

interface MillisLike {
  toMillis(): number;
}

/** The subset of a subscription doc the scoring needs (admin-Timestamp compatible). */
export interface ScorableSubscription {
  status: string;
  units: number;
  schoolId: string;
  businessId: string;
  confirmedAt: MillisLike | null;
  expiresAt: MillisLike | null;
}

/** Whether a subscription currently counts: confirmed/expiring and not past expiry. */
export function isCounting(sub: ScorableSubscription, nowMs: number): boolean {
  if (sub.status === "pending" || sub.status === "expired") return false;
  const exp = sub.expiresAt ? sub.expiresAt.toMillis() : null;
  return exp == null || exp > nowMs;
}

/** Recency decay in (0,1] based on age since confirmation. */
function decayFactor(sub: ScorableSubscription, nowMs: number): number {
  const confirmedMs = sub.confirmedAt ? sub.confirmedAt.toMillis() : null;
  if (confirmedMs == null) return 1;
  const ageDays = Math.max(0, (nowMs - confirmedMs) / DAY_MS);
  return Math.pow(0.5, ageDays / RANKING_WEIGHTS.halfLifeDays);
}

/** Saturate decayed units into a [0,1] signal (bounded advantage). */
function saturate(decayedUnits: number): number {
  if (decayedUnits <= 0) return 0;
  return Math.min(1, decayedUnits / RANKING_WEIGHTS.saturationUnits);
}

export interface ReviewStatsLike {
  count: number;
  average: number;
}

/** Mirror of qualityScore in lib/firestore/ranking.ts. Quality Q ∈ [0,1] from reviews. */
export function qualityScore(stats: ReviewStatsLike | undefined): number {
  if (!stats || stats.count <= 0) return 0;
  const avgNorm = Math.min(1, Math.max(0, (stats.average - 1) / 4));
  const confidence = Math.min(1, stats.count / RANKING_WEIGHTS.reviewSaturationCount);
  return avgNorm * confidence;
}

/**
 * Mission-general baseline score persisted in `business.ranking.score`. All counting
 * support is treated as general (I), since there is no user community at write time;
 * quality Q comes from the business's review aggregate.
 */
export function baselineScore(
  subs: ScorableSubscription[],
  reviewStats: ReviewStatsLike | undefined,
  nowMs: number,
): number {
  let units = 0;
  for (const s of subs) {
    if (!isCounting(s, nowMs)) continue;
    units += s.units * decayFactor(s, nowMs);
  }
  const general = saturate(units);
  return (
    1 +
    RANKING_WEIGHTS.bi * general +
    RANKING_WEIGHTS.bq * qualityScore(reviewStats)
  );
}
