/**
 * Ranking score helpers (pure functions — no Firestore I/O).
 *
 * The score is continuous, not hard tiers, so signals trade off instead of creating
 * cliffs. Relevance is a multiplicative gate, not an additive term, so the mission never
 * surfaces irrelevant results:
 *
 *     S = R × (1 + b_c·C + b_i·I + b_q·Q)
 *
 *   R ∈ [0,1]  relevance to the query (R = 1 in "explore" mode → mission only).
 *   C ∈ [0,1]  support for institutions in the user's community.
 *   I ∈ [0,1]  support for institutions in general (outside the community).
 *   Q ∈ [0,1]  quality (reviews, etc. — not implemented yet → 0).
 *   b_*        bounded weights; the saturation/caps below are the calibration knobs.
 *
 * If R ≈ 0 the whole score collapses regardless of how much the business supports.
 *
 * C and I are reconstructed from a business's `confirmed`/`expiring` subscriptions:
 * unit magnitude with temporal decay (older support weighs less), then saturated into
 * [0,1] so supporting buys a bounded — not infinite — advantage.
 */
import type { SubscriptionDoc } from "@/types";

const DAY_MS = 86_400_000;

/** Tunable knobs. Treat as the main calibration surface. */
export interface RankingWeights {
  /** Weight of community support C. */
  bc: number;
  /** Weight of general support I. */
  bi: number;
  /** Weight of quality Q. */
  bq: number;
  /** Decayed units that saturate a support signal to 1 (the cap on magnitude). */
  saturationUnits: number;
  /** Half-life (days) of support recency: support this old weighs half. */
  halfLifeDays: number;
  /** Number of reviews at which quality confidence reaches 1 (few reviews count less). */
  reviewSaturationCount: number;
}

/**
 * Calibrated defaults — the "Balanceado" profile.
 *
 * Chosen so support clearly leads but a strongly-reviewed non-supporter can still edge out
 * a *very weak* supporter (the mission rewards support without burying good local
 * businesses that haven't subscribed yet). For a fresh canonical scenario (R = 1):
 *   strong community (8u, Q.5) 1.95 > strong general (10u, Q.9) 1.67 >
 *   excellent non-supporter (Q1) 1.30 > weak community (1u, Q.3) 1.19 > basic (Q0) 1.00
 * locked in by ranking-calibration.test.ts.
 *
 * Knobs: `bc/bi` set community-vs-general separation; `saturationUnits` how fast support
 * maxes out (10 units ≈ ₡50k/period for full signal); `halfLifeDays` how fast it decays;
 * `reviewSaturationCount` how many reviews are needed before quality counts fully. Keep
 * this IN SYNC with functions/src/ranking.ts (the drift guard in
 * ranking-calibration.test.ts fails if they diverge).
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  bc: 1.0,
  bi: 0.4,
  bq: 0.3,
  saturationUnits: 10,
  halfLifeDays: 180,
  reviewSaturationCount: 5,
};

/**
 * Whether a subscription currently counts toward the ranking: confirmed (or expiring,
 * which is still confirmed) and not past its expiry. Robust to stale `status` (e.g. no
 * cron has run yet) by also checking `expiresAt` against `nowMs`.
 */
export function isCountingSubscription(
  sub: Pick<SubscriptionDoc, "status" | "expiresAt">,
  nowMs: number = Date.now(),
): boolean {
  if (sub.status === "pending" || sub.status === "expired") return false;
  const expMs = sub.expiresAt?.toMillis?.() ?? null;
  return expMs == null || expMs > nowMs;
}

/** Window (days) of the public "recent support" chip on the school page. */
export const RECENT_SUPPORT_WINDOW_DAYS = 30;

/**
 * Distinct supporters (business pages + personal donors) whose confirmed support was
 * active at some point during the last RECENT_SUPPORT_WINDOW_DAYS. Unlike
 * isCountingSubscription (a point-in-time check), support that lapsed *inside* the
 * window still counts — the school did receive that help within the last 30 days.
 * A COUNT, never an amount: the platform does not publish money figures.
 */
export function countRecentUniqueSupporters(
  subscriptions: SubscriptionDoc[],
  nowMs: number = Date.now(),
): number {
  const windowStartMs = nowMs - RECENT_SUPPORT_WINDOW_DAYS * DAY_MS;
  const supporters = new Set<string>();
  for (const sub of subscriptions) {
    const confirmedMs = sub.confirmedAt?.toMillis?.() ?? null;
    if (confirmedMs == null || confirmedMs > nowMs) continue; // never confirmed
    const expMs = sub.expiresAt?.toMillis?.() ?? null;
    if (expMs != null && expMs <= windowStartMs) continue; // lapsed before the window
    // Absent supporterType = legacy business subscription (see SupporterType).
    const isDonor = sub.supporterType === "user";
    const supporterId = isDonor ? sub.donorId : sub.businessId;
    if (supporterId) supporters.add(`${isDonor ? "u" : "b"}:${supporterId}`);
  }
  return supporters.size;
}

/** Sample size for the "typically confirms in ~X" responsiveness signal. */
export const CONFIRMATION_TIME_SAMPLE = 10;

/**
 * Average registration→first-confirmation time (ms) over the school's most recent
 * CONFIRMATION_TIME_SAMPLE confirmed subscriptions (fewer if the school has fewer),
 * or null with no confirmations. Powers the public "normalmente confirma las
 * donaciones en ~X" chip — gentle pressure on the board that reads as reliability to
 * the donor.
 *
 * The duration is `firstConfirmedAt - createdAt`: renewals move `confirmedAt` forward
 * but never `firstConfirmedAt`, so a renewed subscription contributes its real first
 * response time. Legacy docs predating `firstConfirmedAt` fall back to `confirmedAt`
 * (slightly inflated if they were ever renewed). Recency is still ranked by
 * `confirmedAt` — the latest confirmation activity, renewals included.
 */
export function averageConfirmationTimeMs(
  subscriptions: SubscriptionDoc[],
  sampleSize: number = CONFIRMATION_TIME_SAMPLE,
): number | null {
  const durations = subscriptions
    .map((sub) => {
      const confirmedMs = sub.confirmedAt?.toMillis?.() ?? null;
      const firstMs = sub.firstConfirmedAt?.toMillis?.() ?? confirmedMs;
      const createdMs = sub.createdAt?.toMillis?.() ?? null;
      if (confirmedMs == null || firstMs == null || createdMs == null) {
        return null;
      }
      return { confirmedMs, duration: Math.max(0, firstMs - createdMs) };
    })
    .filter((d): d is { confirmedMs: number; duration: number } => d !== null)
    // Most recent confirmations first — responsiveness is about how the board
    // behaves NOW, not at sign-up time.
    .sort((a, b) => b.confirmedMs - a.confirmedMs)
    .slice(0, sampleSize);
  if (durations.length === 0) return null;
  return (
    durations.reduce((sum, d) => sum + d.duration, 0) / durations.length
  );
}

/** Recency decay factor in (0,1] based on age since confirmation. */
export function decayFactor(
  sub: SubscriptionDoc,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  nowMs: number = Date.now(),
) {
  const confirmedMs = sub.confirmedAt?.toMillis?.() ?? null;
  if (confirmedMs == null) return 1;
  const ageDays = Math.max(0, (nowMs - confirmedMs) / DAY_MS);
  return 0.5 ** (ageDays / weights.halfLifeDays);
}

/** Saturate decayed units into a [0,1] signal (bounded advantage). */
function saturate(decayedUnits: number, weights: RankingWeights): number {
  if (decayedUnits <= 0) return 0;
  return Math.min(1, decayedUnits / weights.saturationUnits);
}

export interface SupportSignals {
  /** C — support for the user's community institutions, in [0,1]. */
  community: number;
  /** I — support for institutions in general (outside the community), in [0,1]. */
  general: number;
  /** Raw decayed units, useful for debugging/calibration. */
  raw: { community: number; general: number };
}

/**
 * Reconstruct C and I for a business from its subscriptions, given which school ids count
 * as the user's community. Only counting subscriptions contribute; each is weighted by
 * `units` × recency decay, then saturated.
 */
export function computeSupportSignals(
  subscriptions: SubscriptionDoc[],
  communitySchoolIds: Iterable<string>,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  nowMs: number = Date.now(),
): SupportSignals {
  const community = new Set(communitySchoolIds);
  let communityUnits = 0;
  let generalUnits = 0;

  for (const sub of subscriptions) {
    if (!isCountingSubscription(sub, nowMs)) continue;
    const weighted = sub.units * decayFactor(sub, weights, nowMs);
    if (community.has(sub.schoolId)) communityUnits += weighted;
    else generalUnits += weighted;
  }

  return {
    community: saturate(communityUnits, weights),
    general: saturate(generalUnits, weights),
    raw: { community: communityUnits, general: generalUnits },
  };
}

/**
 * Quality signal Q ∈ [0,1] from a business's review aggregate. The mean rating is mapped
 * 1★→0, 5★→1, then scaled by a confidence factor so a handful of reviews can't max it out
 * (mirrors the support saturation philosophy). Returns 0 when there are no reviews.
 */
export function qualityScore(
  reviewStats: { count: number; average: number } | undefined,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): number {
  if (!reviewStats || reviewStats.count <= 0) return 0;
  const avgNorm = Math.min(1, Math.max(0, (reviewStats.average - 1) / 4));
  const confidence = Math.min(1, reviewStats.count / weights.reviewSaturationCount);
  return avgNorm * confidence;
}

export interface ScoreInputs {
  /** Relevance to the query in [0,1]. Use 1 for explore mode. */
  relevance: number;
  signals: SupportSignals;
  /** Quality Q in [0,1]. Defaults to 0 until reviews exist. */
  quality?: number;
}

/** Final ranking score S = R × (1 + b_c·C + b_i·I + b_q·Q). */
export function scoreBusiness(
  { relevance, signals, quality = 0 }: ScoreInputs,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): number {
  const mission =
    1 +
    weights.bc * signals.community +
    weights.bi * signals.general +
    weights.bq * quality;
  return relevance * mission;
}
