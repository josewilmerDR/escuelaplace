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
 * maxes out (10 units ≈ ₡50k/period for full signal); `halfLifeDays` how fast it decays.
 * NOTE: quality Q is not implemented yet (no reviews) so `bq` is currently dormant — it
 * only affects ordering once reviews land. Keep this IN SYNC with functions/src/ranking.ts
 * (the drift guard in ranking-calibration.test.ts fails if they diverge).
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  bc: 1.0,
  bi: 0.4,
  bq: 0.3,
  saturationUnits: 10,
  halfLifeDays: 180,
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

/** Recency decay factor in (0,1] based on age since confirmation. */
function decayFactor(sub: SubscriptionDoc, weights: RankingWeights, nowMs: number) {
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
