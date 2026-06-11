/**
 * Donor recognition tiers for the functions runtime.
 *
 * SOURCE OF TRUTH: `lib/firestore/donors.ts` in the web app. Keep the thresholds in sync
 * with that file (the drift guard in lib/firestore/donors.test.ts fails if they diverge).
 * This copy is intentionally dependency-free, same pattern as ./ranking.
 */
export type DonorTier = "bronze" | "silver" | "gold" | "platinum";

const TIER_ORDER: DonorTier[] = ["bronze", "silver", "gold", "platinum"];

/** Mirror of DONOR_TIER_MIN_UNITS in lib/firestore/donors.ts. */
export const DONOR_TIER_MIN_UNITS: Record<DonorTier, number> = {
  bronze: 1,
  silver: 6,
  gold: 26,
  platinum: 101,
};

/** The tier earned by a confirmed-units total, or null below the first threshold. */
export function donorTierForUnits(totalUnits: number): DonorTier | null {
  let earned: DonorTier | null = null;
  for (const tier of TIER_ORDER) {
    if (totalUnits >= DONOR_TIER_MIN_UNITS[tier]) earned = tier;
  }
  return earned;
}
