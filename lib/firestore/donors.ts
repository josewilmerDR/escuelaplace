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
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { cache } from "react";
import { db } from "@/lib/firebase";
import { SUBSCRIPTION_UNIT_CRC } from "@/types";
import type { DonorProfile, DonorProfileDoc, DonorTier } from "@/types";
import { docToTyped } from "./converters";
import { getSubscriptionsBySchool } from "./subscriptions";
import { getContributionsBySchool } from "./projects";

const DONOR_PROFILES = "donorProfiles";
const SUBSCRIPTIONS = "subscriptions";

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
 *
 * `surfaceErrors` opts OUT of that swallowing: when a donor reads their OWN profile (the
 * settings/recognition toggle), a denied/network read is a real error worth showing, not
 * "you are anonymous". The donor-wall and tier reads keep the default (null on error).
 */
export async function getDonorProfile(
  uid: string,
  { surfaceErrors = false }: { surfaceErrors?: boolean } = {},
): Promise<DonorProfileDoc | null> {
  try {
    return docToTyped<DonorProfile>(await getDoc(doc(db, DONOR_PROFILES, uid)));
  } catch (err) {
    if (surfaceErrors) throw err;
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
 *
 * Wrapped in React cache(): the public school profile reads it from both the shared
 * layout (to decide whether the "Agradecimientos" tab exists) and the "Agradecimientos"
 * page during one request — the cache dedupes the underlying reads.
 */
export const getSchoolDonorWall = cache(
  async (schoolId: string): Promise<SchoolDonorWall> => {
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

  const profiles = await Promise.all(
    donorIds.map((id) => getDonorProfile(id)),
  );
  const recognized = profiles
    .filter((p): p is DonorProfileDoc => p != null && p.isPublic)
    .sort(
      (a, b) =>
        (a.firstConfirmedAt?.toMillis?.() ?? 0) -
        (b.firstConfirmedAt?.toMillis?.() ?? 0),
    );

  return { recognized, anonymousCount: donorIds.length - recognized.length };
  },
);

// ── Writes (donations & donor recognition) ───────────────────────────────────
// Any signed-in user — no page needed — may donate to a school. Same entity and
// lifecycle as a business subscription (`supporterType: 'user'`, stored in the
// `subscriptions` collection): the school confirms the payment proof; confirmed donations
// feed the donor's recognition tier via a Cloud Function. The platform never touches the
// money. The proof is uploaded with uploadSubscriptionProof, exactly like a subscription.

export interface CreateDonationInput {
  donorId: string;
  /** Denormalized account name so the school's confirmation UI can match the proof. */
  donorName: string;
  schoolId: string;
  schoolName: string; // denormalized
  /** Integer n in `n × SUBSCRIPTION_UNIT_CRC`. */
  units: number;
}

/**
 * Create a `pending` personal donation. Must be called by the signed-in donor (the rules
 * enforce `donorId == auth.uid`). The payment proof is uploaded separately with
 * uploadSubscriptionProof, exactly like a business subscription. Returns the new id.
 */
export async function createDonation(
  input: CreateDonationInput,
): Promise<string> {
  const created = await addDoc(collection(db, SUBSCRIPTIONS), {
    supporterType: "user",
    donorId: input.donorId,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    status: "pending",
    confirmedAt: null,
    firstConfirmedAt: null,
    expiresAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // The donor's real name AND the donation magnitude (`units`/`amount`) go into a PRIVATE
  // subdoc, never the public doc — so an anonymous scraper of `subscriptions` can neither
  // deanonymize an opt-out donor nor read how much they gave. Readable only by the donor, the
  // target school, or admin; the donor tier is computed by a Cloud Function from THIS `units`
  // (firestore.rules freezes it once the school confirms).
  await setDoc(doc(db, SUBSCRIPTIONS, created.id, "private", "data"), {
    donorName: input.donorName,
    units: input.units,
    amount: input.units * SUBSCRIPTION_UNIT_CRC,
  });
  return created.id;
}

/**
 * Create the donor's recognition profile if it doesn't exist yet. Private by default
 * (recognition is opt-in); every computed field starts zeroed — the rules reject any
 * other seed, and a Cloud Function maintains them from confirmed donations.
 */
export async function ensureDonorProfile(
  uid: string,
  displayName: string,
): Promise<void> {
  const ref = doc(db, DONOR_PROFILES, uid);
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, {
    displayName,
    isPublic: false,
    totalUnits: 0,
    tier: null,
    schoolsSupported: 0,
    projectsSupported: 0,
    firstConfirmedAt: null,
    lastConfirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update the donor's public-recognition preferences — the only fields the donor may
 * write (the rules block everything computed). Must be called by the donor themselves.
 */
export async function updateDonorRecognition(
  uid: string,
  prefs: { displayName?: string; isPublic?: boolean },
): Promise<void> {
  await updateDoc(doc(db, DONOR_PROFILES, uid), {
    ...prefs,
    updatedAt: serverTimestamp(),
  });
}
