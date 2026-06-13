/**
 * Personal-donor recognition: tier thresholds (pure helpers, no I/O) and typed reads of
 * the `donorProfiles` collection.
 *
 * Tiers are derived from accumulated CONFIRMED units (1 unit = SUBSCRIPTION_UNIT_CRC),
 * never from pending self-reports, and are written exclusively by a Cloud Function — the
 * same trust boundary as the business ranking (see firestore.rules). Public surfaces
 * render the tier and seniority only; never units or colones.
 *
 * Keep the thresholds IN SYNC with the mirror in functions/src (dependency-free copy for
 * the functions runtime), like the ranking weights.
 */
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { DonorProfile, DonorProfileDoc, DonorTier } from "@/types";
import { docToTyped } from "./converters";
import { getSubscriptionsBySchool } from "./subscriptions";
import { getContributionsBySchool } from "./projects";

const DONOR_PROFILES = "donorProfiles";

/** Tiers from lowest to highest. */
export const DONOR_TIER_ORDER: DonorTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
];

/**
 * Minimum accumulated confirmed units per tier (geometric ~4× steps so each tier stays
 * reachable). At ₡5.000/unit: bronze ₡5k–25k, silver ₡30k–125k, gold ₡130k–500k,
 * platinum ₡505k+. A single minimum donation already earns bronze, so every confirmed
 * donor gets recognized immediately.
 */
export const DONOR_TIER_MIN_UNITS: Record<DonorTier, number> = {
  bronze: 1,
  silver: 6,
  gold: 26,
  platinum: 101,
};

/** The tier earned by a confirmed-units total, or null below the first threshold. */
export function donorTierForUnits(totalUnits: number): DonorTier | null {
  let earned: DonorTier | null = null;
  for (const tier of DONOR_TIER_ORDER) {
    if (totalUnits >= DONOR_TIER_MIN_UNITS[tier]) earned = tier;
  }
  return earned;
}

/**
 * A donor's public recognition profile, or null if it does not exist or the read is
 * denied (rules hide non-public profiles from other users — treat both as "anonymous").
 */
export async function getDonorProfile(
  uid: string,
): Promise<DonorProfileDoc | null> {
  try {
    return docToTyped<DonorProfile>(await getDoc(doc(db, DONOR_PROFILES, uid)));
  } catch {
    return null;
  }
}

export interface SchoolDonorWall {
  /** Donors who opted into public recognition, in seniority order (oldest first). */
  recognized: DonorProfileDoc[];
  /** Ever-confirmed donors who stay anonymous (opted out, or profile unreadable). */
  anonymousCount: number;
}

/**
 * The thank-you wall of a school: every personal supporter the school has EVER confirmed —
 * both recurring donors and one-off project contributors (gratitude doesn't lapse with the
 * 90-day active-support window). Profiles are resolved through the rules gate — anonymous
 * readers only see opted-in ones; the rest are counted, not named. Deliberately ordered by
 * seniority, never by amount: this is gratitude, not a leaderboard.
 */
export async function getSchoolDonorWall(
  schoolId: string,
): Promise<SchoolDonorWall> {
  const [subs, contributions] = await Promise.all([
    getSubscriptionsBySchool(schoolId),
    getContributionsBySchool(schoolId),
  ]);
  const donorIds = [
    ...new Set([
      ...subs
        .filter(
          (s) =>
            s.supporterType === "user" &&
            s.donorId != null &&
            s.confirmedAt != null,
        )
        .map((s) => s.donorId as string),
      ...contributions
        .filter((c) => c.confirmedAt != null)
        .map((c) => c.donorId),
    ]),
  ];

  const profiles = await Promise.all(donorIds.map(getDonorProfile));
  const recognized = profiles
    .filter((p): p is DonorProfileDoc => p != null && p.isPublic)
    .sort(
      (a, b) =>
        (a.firstConfirmedAt?.toMillis?.() ?? 0) -
        (b.firstConfirmedAt?.toMillis?.() ?? 0),
    );

  return { recognized, anonymousCount: donorIds.length - recognized.length };
}
