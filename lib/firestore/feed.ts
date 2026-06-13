/**
 * Feed ordering — turns a candidate set of businesses into the mission-aware order, per
 * the two usage modes:
 *
 * - Explore (no query): mission leads. R = 1 for everyone, so the order is community
 *   supporters → general supporters → not-yet-supporting (a continuous score, so a strong
 *   general supporter can edge out a weak community one — no hard cliffs by design).
 * - Search (e.g. "english classes"): relevance first, then mission. R per business gates
 *   the result (R ≈ 0 collapses the score), then the same mission boost orders the
 *   relevant ones.
 *
 * Ordering is personalized (it depends on the buyer's community), so it CANNOT be
 * statically cached per user — it runs at request time over a bounded candidate set.
 * The buyer's community comes from their location/chosen school (localStorage, never
 * Firestore); the caller passes those in.
 */
import type { BusinessDoc, SubscriptionDoc } from "@/types";
import { getNearbySchoolIds } from "./geo";
import {
  DEFAULT_RANKING_WEIGHTS,
  type RankingWeights,
  computeSupportSignals,
  decayFactor,
  isCountingSubscription,
  qualityScore,
  scoreBusiness,
} from "./ranking";
import { getSubscriptionsForBusinesses } from "./subscriptions";

/** The buyer's community inputs (sourced from localStorage on the client). */
export interface BuyerCommunity {
  location?: { lat: number; lng: number };
  /** A school the buyer explicitly chose; always part of their community. */
  schoolId?: string;
}

/**
 * Radius (km) around the buyer's location within which a school counts as part of their
 * community. Shared with the picker UI so the "no schools near you" notice and the
 * actual ranking can never disagree.
 */
export const COMMUNITY_RADIUS_KM = 5;

/**
 * Resolve the set of school ids that count as the buyer's community: their explicitly
 * chosen school plus any school within `radiusKm` of their location. Returns [] if no
 * community can be resolved (then C = 0 for everyone and only general support I matters).
 */
export async function resolveCommunitySchoolIds(
  community: BuyerCommunity,
  radiusKm = COMMUNITY_RADIUS_KM,
): Promise<string[]> {
  const ids = new Set<string>();
  if (community.schoolId) ids.add(community.schoolId);
  if (community.location) {
    const nearby = await getNearbySchoolIds(
      [community.location.lat, community.location.lng],
      radiusKm,
    );
    nearby.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/**
 * Support tier for the UI ramp: businesses that don't support yet aren't buried, they
 * show lower with an "invite them" badge that flips once they start supporting.
 */
export type SupportTier = "community" | "general" | "none";

/**
 * Minimal shape the ranking needs from a business. Both `BusinessDoc` (server) and the
 * serializable `BusinessCardData` (client) satisfy it, so the feed runs on either side.
 */
export interface RankableBusiness {
  id: string;
  name?: string;
  ranking?: { score?: number } | null;
  reviewStats?: { count: number; average: number };
}

/** A school a business actually supports (from its counting subscriptions). */
export interface SupportedSchool {
  id: string;
  name: string;
}

export interface RankedBusiness<T extends RankableBusiness = BusinessDoc> {
  business: T;
  /** Final score S used for ordering. */
  score: number;
  tier: SupportTier;
  /** Relevance R applied (1 in explore mode). */
  relevance: number;
  /**
   * Schools this business genuinely supports, ordered by relevance to the buyer
   * (community schools first, then by decayed support magnitude). Empty when it
   * supports none. Powers the "Apoya a {school} y N más" card line — distinct from
   * the business's *linked* school, which it may not support.
   */
  supportedSchools: SupportedSchool[];
}

/**
 * Schools a business genuinely supports, deduped by id and ordered so the most
 * buyer-relevant one comes first: community schools (by decayed units), then the rest
 * (by decayed units). Only counting subscriptions contribute, so a business that never
 * confirmed — or whose support lapsed — yields [].
 */
export function supportedSchoolsOf(
  subscriptions: SubscriptionDoc[],
  communitySchoolIds: Iterable<string>,
  nowMs: number = Date.now(),
): SupportedSchool[] {
  const community = new Set(communitySchoolIds);
  // Accumulate decayed weight per school so multiple subscriptions to one school
  // collapse to a single entry ranked by total support.
  const byId = new Map<string, { name: string; weight: number; inCommunity: boolean }>();
  for (const sub of subscriptions) {
    if (!isCountingSubscription(sub, nowMs)) continue;
    const weight = sub.units * decayFactor(sub, DEFAULT_RANKING_WEIGHTS, nowMs);
    const existing = byId.get(sub.schoolId);
    if (existing) existing.weight += weight;
    else
      byId.set(sub.schoolId, {
        name: sub.schoolName,
        weight,
        inCommunity: community.has(sub.schoolId),
      });
  }
  return [...byId.entries()]
    .sort(
      (a, b) =>
        Number(b[1].inCommunity) - Number(a[1].inCommunity) ||
        b[1].weight - a[1].weight,
    )
    .map(([id, { name }]) => ({ id, name }));
}

export interface RankFeedOptions {
  communitySchoolIds: Iterable<string>;
  /**
   * Relevance R per business id, in [0,1] (search mode). Omit for explore mode, where
   * R = 1 for every business. Businesses absent from the map get R = 0 and are dropped.
   */
  relevanceById?: Map<string, number> | Record<string, number>;
  weights?: RankingWeights;
  /** Injectable clock for deterministic tests. */
  nowMs?: number;
}

function relevanceOf(
  relevanceById: RankFeedOptions["relevanceById"],
  id: string,
): number {
  if (!relevanceById) return 1; // explore mode
  if (relevanceById instanceof Map) return relevanceById.get(id) ?? 0;
  return relevanceById[id] ?? 0;
}

/**
 * Rank a candidate set of businesses. Fetches their subscriptions in a few chunked reads,
 * reconstructs each one's support signals, scores, and sorts by score (desc). In search
 * mode, businesses with R = 0 are dropped (the mission never surfaces irrelevant results).
 * Ties break by the stored `ranking.score` then name for a stable order.
 */
export async function rankBusinessFeed<T extends RankableBusiness>(
  businesses: T[],
  options: RankFeedOptions,
): Promise<RankedBusiness<T>[]> {
  const {
    communitySchoolIds,
    relevanceById,
    weights = DEFAULT_RANKING_WEIGHTS,
    nowMs = Date.now(),
  } = options;
  const isExplore = relevanceById == null;

  const subs = await getSubscriptionsForBusinesses(businesses.map((b) => b.id));
  const byBusiness = new Map<string, SubscriptionDoc[]>();
  for (const s of subs) {
    // Personal donations have no businessId and never feed a business's ranking
    // (the query above already excludes them; this also narrows the optional field).
    if (!s.businessId) continue;
    const arr = byBusiness.get(s.businessId);
    if (arr) arr.push(s);
    else byBusiness.set(s.businessId, [s]);
  }

  const community = [...communitySchoolIds];
  const ranked = businesses.map((business) => {
    const businessSubs = byBusiness.get(business.id) ?? [];
    const signals = computeSupportSignals(businessSubs, community, weights, nowMs);
    const relevance = relevanceOf(relevanceById, business.id);
    const quality = qualityScore(business.reviewStats, weights);
    const score = scoreBusiness({ relevance, signals, quality }, weights);
    const tier: SupportTier =
      signals.community > 0 ? "community" : signals.general > 0 ? "general" : "none";
    const supportedSchools = supportedSchoolsOf(businessSubs, community, nowMs);
    return { business, score, tier, relevance, supportedSchools };
  });

  const visible = isExplore ? ranked : ranked.filter((r) => r.relevance > 0);

  return visible.sort(
    (a, b) =>
      b.score - a.score ||
      (b.business.ranking?.score ?? 0) - (a.business.ranking?.score ?? 0) ||
      (a.business.name ?? "").localeCompare(b.business.name ?? ""),
  );
}
