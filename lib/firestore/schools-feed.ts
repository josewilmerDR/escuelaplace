/**
 * School relevance ordering for the donation flows — the public `/schools` directory and the
 * `/panel/donate` picker. Pure helpers, no Firestore I/O (`distanceBetween` from
 * geofire-common is local math), mirroring the philosophy of ranking.ts / feed.ts for
 * businesses.
 *
 * v1 relevance LEADS with proximity and uses ACTIVITY as the baseline and tie-breaker, so a
 * donor never meets "Escuela Aurora" first just because it sorts alphabetically. The score is
 * continuous (no hard tiers) — a strongly active distant school can still edge out a nearby
 * dormant one — the same no-cliffs design as the business ranking.
 *
 *     S = wP·proximity + wA·activity + (verified ? verifiedBonus : 0)
 *
 *   proximity ∈ [0,1]  closeness to the buyer (1 at distance 0; 0 when no location/geopoint).
 *   activity  ∈ [0,1]  saturated supporter activity, from the school's denormalized metrics.
 *
 * Future signals (active projects, recent confirmed support, "likes") need per-school reads or
 * data schools don't carry yet; they slot in as extra additive terms without reshaping callers.
 */
import { distanceBetween } from "geofire-common";

/** Tunable knobs — the calibration surface for school relevance. */
export interface SchoolRankingWeights {
  /** Weight of proximity (leads). */
  wProximity: number;
  /** Weight of activity (baseline / tie-breaker). */
  wActivity: number;
  /** Additive nudge for verified schools (they can actually receive and show payment methods). */
  verifiedBonus: number;
  /** Combined supporters (businesses + unique supporters) that saturate activity to 1. */
  activitySaturation: number;
  /** Distance (km) at which the proximity signal halves. */
  proximityHalfLifeKm: number;
}

/**
 * Calibrated defaults. Proximity dominates (wProximity > wActivity): a school at the buyer's
 * doorstep (proximity 1 → 1.0) outranks a maximally active one across the country (activity 1
 * → 0.4). `proximityHalfLifeKm` echoes COMMUNITY_RADIUS_KM (feed.ts) so "near" means the same
 * thing the buyer's community already does. `verifiedBonus` is small — enough to edge ahead at
 * a tie, not enough to bury a much closer or far more active school.
 */
export const DEFAULT_SCHOOL_WEIGHTS: SchoolRankingWeights = {
  wProximity: 1.0,
  wActivity: 0.4,
  verifiedBonus: 0.15,
  activitySaturation: 12,
  proximityHalfLifeKm: 5,
};

/** Minimal shape the ranking needs from a school. Satisfied by `SchoolCardData`. */
export interface RankableSchool {
  id: string;
  name?: string;
  supportingBusinesses?: number;
  uniqueSupporters?: number;
  verified?: boolean;
  /** Pin coordinates; null/undefined when the school has no geopoint. */
  lat?: number | null;
  lng?: number | null;
}

/**
 * The school's distinct-supporter count. `uniqueSupporters` already counts every kind of
 * supporter (business pages + personal donors), so it is the figure to use — NOT a sum with
 * `supportingBusinesses`, which it already includes (that would double-count businesses).
 * Legacy docs predate `uniqueSupporters`; for them we fall back to `supportingBusinesses`.
 * Shared by the activity score and the card's supporters chip so the two never disagree.
 */
export function schoolSupportersCount(
  school: Pick<RankableSchool, "supportingBusinesses" | "uniqueSupporters">,
): number {
  return Math.max(school.uniqueSupporters ?? 0, school.supportingBusinesses ?? 0);
}

/**
 * Activity signal ∈ [0,1]: the distinct-supporter count saturated so support buys a bounded —
 * not infinite — advantage (mirrors the support saturation in ranking.ts). 0 when the school
 * has no counted supporters yet.
 */
export function schoolActivityScore(
  school: Pick<RankableSchool, "supportingBusinesses" | "uniqueSupporters">,
  weights: SchoolRankingWeights = DEFAULT_SCHOOL_WEIGHTS,
): number {
  const supporters = schoolSupportersCount(school);
  if (supporters <= 0) return 0;
  return Math.min(1, supporters / weights.activitySaturation);
}

/**
 * Proximity signal ∈ [0,1] from distance (km): 1 at 0 km, halving every `proximityHalfLifeKm`.
 * `null` distance (no buyer location, or the school has no geopoint) yields 0.
 */
export function schoolProximityScore(
  distanceKm: number | null,
  weights: SchoolRankingWeights = DEFAULT_SCHOOL_WEIGHTS,
): number {
  if (distanceKm == null) return 0;
  return 0.5 ** (Math.max(0, distanceKm) / weights.proximityHalfLifeKm);
}

export interface RankedSchool<T extends RankableSchool = RankableSchool> {
  school: T;
  /** Final relevance score used for ordering. */
  score: number;
  /** Distance to the buyer in km, or null when there is no location/geopoint. */
  distanceKm: number | null;
}

export interface RankSchoolsOptions {
  /** Buyer center. Omit → proximity = 0 for everyone (activity-only baseline order). */
  location?: { lat: number; lng: number };
  weights?: SchoolRankingWeights;
}

/**
 * Order schools by relevance (descending). With no `location`, proximity is 0 for everyone and
 * the order collapses to activity — which is exactly the SSR baseline, so the SAME function
 * powers both the server render (no location) and the client proximity re-rank. Ties break by
 * activity, then name, for a stable order.
 */
export function rankSchoolsByRelevance<T extends RankableSchool>(
  schools: T[],
  options: RankSchoolsOptions = {},
): RankedSchool<T>[] {
  const { location, weights = DEFAULT_SCHOOL_WEIGHTS } = options;
  const center: [number, number] | null = location
    ? [location.lat, location.lng]
    : null;

  const ranked = schools.map((school) => {
    const hasPin = school.lat != null && school.lng != null;
    const distanceKm =
      center && hasPin
        ? distanceBetween([school.lat as number, school.lng as number], center)
        : null;
    const activity = schoolActivityScore(school, weights);
    const proximity = schoolProximityScore(distanceKm, weights);
    const score =
      weights.wProximity * proximity +
      weights.wActivity * activity +
      (school.verified ? weights.verifiedBonus : 0);
    return { school, score, distanceKm, activity };
  });

  return ranked
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.activity - a.activity ||
        (a.school.name ?? "").localeCompare(b.school.name ?? ""),
    )
    .map(({ school, score, distanceKm }) => ({ school, score, distanceKm }));
}
