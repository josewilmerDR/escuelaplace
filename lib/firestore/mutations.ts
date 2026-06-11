/**
 * Typed writes (mutations) for self-administered pages. These run client-side from the
 * panel (the owner is signed in); reads for SSR live in the per-collection files.
 *
 * School verification rule (schools only): editing a sensitive field (name or SINPE) of
 * an already-verified school drops it back to `needs_reverification` so the SINPE is
 * hidden and the "unverified data" banner reappears until admin re-approves. Owners can
 * never set `verified`/`verificationStatus` to verified — only admin can (see rules).
 */
import {
  GeoPoint,
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { geohashForLocation } from "geofire-common";
import { db, storage } from "@/lib/firebase";
import { subscriptionProofPath } from "./subscriptions";
import {
  SUBSCRIPTION_CONFIRMATION_DAYS,
  SUBSCRIPTION_UNIT_CRC,
} from "@/types";
import type {
  BusinessContact,
  School,
  SchoolPrivate,
} from "@/types";

const SCHOOLS = "schools";
const BUSINESSES = "businesses";
const USERS = "users";
const SUBSCRIPTIONS = "subscriptions";
const DONOR_PROFILES = "donorProfiles";
const DAY_MS = 86_400_000;

/** A URL-safe slug from a display name (used for business public URLs). */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Location captured by the creation forms (lat/lng + administrative fields). */
export interface LocationInput {
  lat: number;
  lng: number;
  province: string;
  canton: string;
  district: string;
  address?: string;
}

function toLocation(input: LocationInput) {
  return {
    geopoint: new GeoPoint(input.lat, input.lng),
    geohash: geohashForLocation([input.lat, input.lng]),
    province: input.province,
    canton: input.canton,
    district: input.district,
  };
}

/** Append a page reference to the user's managedPages (as owner). */
async function linkPageToUser(
  uid: string,
  type: "business" | "school",
  id: string,
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), {
    managedPages: arrayUnion({ type, id, role: "owner" }),
  });
}

/** Fields of the public school doc an owner may edit through the panel. */
export type SchoolProfilePatch = Partial<
  Pick<
    School,
    | "name"
    | "description"
    | "thankYouMessage"
    | "location"
    | "photoUrl"
    | "boardContact"
  >
>;

/**
 * Update the public school doc. If `name` changes while the school is currently
 * `verified`, the verification is dropped to `needs_reverification`. Pass the school's
 * current `verificationStatus` so we don't need an extra read before writing.
 */
export async function updateSchoolProfile(
  id: string,
  patch: SchoolProfilePatch,
  currentStatus: School["verificationStatus"],
): Promise<void> {
  const dropsVerification =
    "name" in patch && currentStatus === "verified";

  await updateDoc(doc(db, SCHOOLS, id), {
    ...patch,
    ...(dropsVerification
      ? { verified: false, verificationStatus: "needs_reverification" }
      : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Write the school's SINPE (private subcollection). Editing the SINPE is always
 * sensitive, so if the school is currently `verified` we also drop the public doc to
 * `needs_reverification` (which re-hides the SINPE until admin re-approves).
 */
export async function updateSchoolSinpe(
  id: string,
  sinpe: SchoolPrivate["sinpe"],
  currentStatus: School["verificationStatus"],
): Promise<void> {
  await setDoc(doc(db, SCHOOLS, id, "private", "data"), { sinpe }, { merge: true });

  if (currentStatus === "verified") {
    await updateDoc(doc(db, SCHOOLS, id), {
      verified: false,
      verificationStatus: "needs_reverification",
      updatedAt: serverTimestamp(),
    });
  }
}

// ── Page creation (onboarding) ───────────────────────────────────────────────

export interface CreateBusinessInput {
  name: string;
  description: string;
  categories: string[]; // category ids
  categoryNames: string[]; // denormalized
  schoolId: string;
  schoolName: string; // denormalized
  location: LocationInput;
  contact?: BusinessContact;
}

/**
 * Create a business page owned by `uid` and link it to the user's managedPages.
 * Starts as a `draft`, unverified, with empty metrics/ranking and an inactive
 * subscription — the owner completes the rest from the edit page. Returns the new id.
 */
export async function createBusinessPage(
  uid: string,
  input: CreateBusinessInput,
): Promise<string> {
  const ref = await addDoc(collection(db, BUSINESSES), {
    name: input.name,
    slug: slugify(input.name),
    description: input.description,
    categories: input.categories,
    categoryNames: input.categoryNames,
    location: toLocation(input.location),
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    contact: input.contact ?? {},
    discount: { active: false, text: "" },
    photos: [],
    status: "draft",
    verified: false,
    subscription: { active: false, plan: "", validUntil: null },
    ranking: { score: 0, totalDonated: 0 },
    metrics: { views: 0, interactions: 0 },
    reviewStats: { count: 0, average: 0 },
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await linkPageToUser(uid, "business", ref.id);
  return ref.id;
}

export interface CreateSchoolInput {
  name: string;
  mepCode: string;
  description?: string;
  thankYouMessage?: string;
  location: Omit<LocationInput, "address">;
  boardContact: School["boardContact"];
  /** Optional SINPE; stored in the private subcollection, hidden until verified. */
  sinpe?: SchoolPrivate["sinpe"];
}

/**
 * Create a school page owned by `uid` and link it to the user's managedPages. Schools
 * are self-administered but start unverified (`pending`): the SINPE stays hidden and an
 * "unverified data" banner shows until admin approves. Returns the new id.
 */
export async function createSchoolPage(
  uid: string,
  input: CreateSchoolInput,
): Promise<string> {
  const ref = await addDoc(collection(db, SCHOOLS), {
    name: input.name,
    mepCode: input.mepCode,
    description: input.description ?? "",
    thankYouMessage: input.thankYouMessage ?? "",
    location: toLocation(input.location),
    boardContact: input.boardContact,
    status: "pending",
    verified: false,
    verificationStatus: "pending",
    metrics: { supportingBusinesses: 0, uniqueSupporters: 0 },
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (input.sinpe) {
    await setDoc(doc(db, SCHOOLS, ref.id, "private", "data"), {
      sinpe: input.sinpe,
    });
  }

  await linkPageToUser(uid, "school", ref.id);
  return ref.id;
}

// ── Subscriptions (support relationship) ─────────────────────────────────────
// A business subscribes to (commits to support) a school. The business creates it as
// `pending`; ONLY the target school's board (owner/editors) or admin confirms it (the
// business can never self-confirm — see firestore.rules). Confirmation is time-boxed
// (`expiresAt`) and must be renewed, which keeps the ranking from going stale.

export interface CreateSubscriptionInput {
  businessId: string;
  businessName: string; // denormalized
  schoolId: string;
  schoolName: string; // denormalized
  /** Integer n in `n × SUBSCRIPTION_UNIT_CRC`. */
  units: number;
}

/**
 * Create a `pending` subscription. Must be called by the business owner/editor (the rules
 * enforce it). `amount` is denormalized from `units`. The SINPE proof is uploaded
 * separately (see uploadSubscriptionProof) — it must not go in this public doc. Returns
 * the new id.
 */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<string> {
  const created = await addDoc(collection(db, SUBSCRIPTIONS), {
    supporterType: "business",
    businessId: input.businessId,
    businessName: input.businessName,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    units: input.units,
    amount: input.units * SUBSCRIPTION_UNIT_CRC,
    status: "pending",
    confirmedAt: null,
    expiresAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/**
 * Upload (or replace) the SINPE proof file for a subscription. The file goes to the
 * private Storage path (gated by storage.rules to the business side / school / admin);
 * only the non-sensitive `proofUploaded` flag is written to the public doc. Must be called
 * by the business owner/editor.
 */
export async function uploadSubscriptionProof(
  subscriptionId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(
    storageRef(storage, subscriptionProofPath(subscriptionId)),
    file,
  );
  await updateDoc(doc(db, SUBSCRIPTIONS, subscriptionId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Confirm (or renew) a subscription. Must be called by the school's board (owner/editors)
 * or admin. Sets it to `confirmed`, stamps `confirmedAt`/`confirmedBy`, and sets
 * `expiresAt` `durationDays` from now (computed client-side since serverTimestamp can't be
 * offset). Renewing simply re-confirms and pushes `expiresAt` forward.
 */
export async function confirmSubscription(
  id: string,
  confirmedBy: string,
  durationDays: number = SUBSCRIPTION_CONFIRMATION_DAYS,
): Promise<void> {
  await updateDoc(doc(db, SUBSCRIPTIONS, id), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    expiresAt: Timestamp.fromMillis(Date.now() + durationDays * DAY_MS),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Mark a subscription `expired` (no renewal). Intended for the school/admin or a future
 * scheduled job; until then the ranking treats a lapsed `expiresAt` as non-counting
 * regardless of stored status (see `isCountingSubscription`).
 */
export async function expireSubscription(id: string): Promise<void> {
  await updateDoc(doc(db, SUBSCRIPTIONS, id), {
    status: "expired",
    updatedAt: serverTimestamp(),
  });
}

// ── Personal donations & donor recognition ───────────────────────────────────
// Any signed-in user — no page needed — may donate to a school. Same entity and
// lifecycle as a business subscription (`supporterType: 'user'`): the school confirms
// the SINPE proof; confirmed donations feed the donor's recognition tier via a Cloud
// Function. The platform never touches the money.

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
 * enforce `donorId == auth.uid`). The SINPE proof is uploaded separately with
 * uploadSubscriptionProof, exactly like a business subscription. Returns the new id.
 */
export async function createDonation(
  input: CreateDonationInput,
): Promise<string> {
  const created = await addDoc(collection(db, SUBSCRIPTIONS), {
    supporterType: "user",
    donorId: input.donorId,
    donorName: input.donorName,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    units: input.units,
    amount: input.units * SUBSCRIPTION_UNIT_CRC,
    status: "pending",
    confirmedAt: null,
    expiresAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
