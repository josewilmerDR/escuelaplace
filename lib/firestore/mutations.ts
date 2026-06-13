/**
 * Typed writes (mutations) for self-administered pages. These run client-side from the
 * panel (the owner is signed in); reads for SSR live in the per-collection files.
 *
 * School verification rule (schools only): editing a sensitive field (name or payment
 * methods) of an already-verified school drops it back to `needs_reverification` so the
 * payment data is hidden and the "unverified data" banner reappears until admin
 * re-approves. Owners can
 * never set `verified`/`verificationStatus` to verified — only admin can (see rules).
 */
import {
  GeoPoint,
  Timestamp,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { geohashForLocation } from "geofire-common";
import { db, storage } from "@/lib/firebase";
import { invalidateSchoolsCache } from "./schools";
import { subscriptionProofPath } from "./subscriptions";
import { contributionProofPath } from "./projects";
import {
  SUBSCRIPTION_CONFIRMATION_DAYS,
  SUBSCRIPTION_UNIT_CRC,
} from "@/types";
import type {
  BusinessContact,
  BusinessStatus,
  Discount,
  PaymentMethod,
  ProjectContributionType,
  ProjectCurrency,
  ProjectStage,
  ProjectStatus,
  School,
} from "@/types";

const SCHOOLS = "schools";
const BUSINESSES = "businesses";
const USERS = "users";
const SUBSCRIPTIONS = "subscriptions";
const DONOR_PROFILES = "donorProfiles";
const PROJECTS = "projects";
const PROJECT_CONTRIBUTIONS = "projectContributions";
const DAY_MS = 86_400_000;

/**
 * A URL-safe slug from a display name (used for business public URLs). Exported so the
 * create form can preview the public URL while the owner types the name.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * A slug no other business holds yet: the slugified name, or name-2, name-3… on
 * collision. Business names repeat a lot ("Soda La Esperanza"), and getBusinessBySlug
 * resolves a single doc — a duplicate slug would leave one of the two profiles
 * unreachable forever, silently. The check spans every status (a draft holds its slug).
 * Lookup + create is not transactional, so two simultaneous creates with the same name
 * could still collide; that window is milliseconds and a collision costs one of them
 * the public URL until renamed — acceptable next to the everyday homonym case.
 */
async function uniqueBusinessSlug(name: string): Promise<string> {
  const base = slugify(name) || "comercio";
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await getDocs(
      query(
        collection(db, BUSINESSES),
        where("slug", "==", candidate),
        fbLimit(1),
      ),
    );
    if (taken.empty) return candidate;
  }
  // 100 homonyms: give up on pretty and guarantee uniqueness with a time suffix.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Location captured by the creation forms: lat/lng plus the country-agnostic
 * administrative levels (see types/firestore.ts — admin1 = province/state/department,
 * admin2 = canton/municipality, admin3 = district/community, "" when absent).
 */
export interface LocationInput {
  lat: number;
  lng: number;
  admin1: string;
  admin2: string;
  admin3: string;
  /** ISO 3166-1 alpha-2 code from the reverse geocoder, when available. */
  country?: string;
  address?: string;
}

function toLocation(input: LocationInput) {
  return {
    geopoint: new GeoPoint(input.lat, input.lng),
    geohash: geohashForLocation([input.lat, input.lng]),
    // Conditional spread: Firestore rejects explicit `undefined` values.
    ...(input.address ? { address: input.address } : {}),
    ...(input.country ? { country: input.country } : {}),
    admin1: input.admin1,
    admin2: input.admin2,
    admin3: input.admin3,
  };
}

/**
 * Queue the managedPages link (as owner) on the same batch as the page creation. If
 * this write ran separately and failed after the page doc existed, the page would be
 * orphaned: invisible in the panel, with a retry creating a duplicate.
 */
function linkPageToUser(
  batch: WriteBatch,
  uid: string,
  type: "business" | "school",
  id: string,
): void {
  batch.update(doc(db, USERS, uid), {
    managedPages: arrayUnion({ type, id, role: "owner" }),
  });
}

/** Fields of the public school doc an owner may edit through the panel. The location
 * comes as raw form input (lat/lng + admin levels) and is converted with toLocation so
 * the geohash is always recomputed when the pin moves. */
export type SchoolProfilePatch = Partial<
  Pick<
    School,
    | "name"
    | "description"
    | "thankYouMessage"
    | "photoUrl"
    | "coverUrl"
    | "photos"
    | "boardContact"
  >
> & { location?: Omit<LocationInput, "address"> };

/**
 * Update the public school doc. If `name` changes while the school is currently
 * `verified`, the verification is dropped to `needs_reverification`. Pass the school's
 * current `verificationStatus` so we don't need an extra read before writing.
 * Callers should include `name` in the patch ONLY when it actually changed — its mere
 * presence is what drops the verification.
 */
export async function updateSchoolProfile(
  id: string,
  patch: SchoolProfilePatch,
  currentStatus: School["verificationStatus"],
): Promise<void> {
  const dropsVerification =
    "name" in patch && currentStatus === "verified";

  const { location, ...rest } = patch;
  await updateDoc(doc(db, SCHOOLS, id), {
    ...rest,
    ...(location ? { location: toLocation(location) } : {}),
    ...(dropsVerification
      ? { verified: false, verificationStatus: "needs_reverification" }
      : {}),
    updatedAt: serverTimestamp(),
  });

  // A rename must reach the pickers (donate, subscribe, community combobox) before
  // their TTL cache would naturally expire.
  if ("name" in patch) invalidateSchoolsCache();
}

/** Public Storage path of a school profile asset (public read via storage.rules). */
function schoolImagePath(schoolId: string, kind: "photo" | "cover"): string {
  return `schools/${schoolId}/${kind}`;
}

/**
 * Upload (or replace) the school's profile photo or cover and return its URL. The
 * caller persists the URL via updateSchoolProfile (photoUrl/coverUrl) — image changes
 * are not sensitive, so they never touch the verification status.
 */
export async function uploadSchoolImage(
  schoolId: string,
  kind: "photo" | "cover",
  file: Blob,
): Promise<string> {
  const ref = storageRef(storage, schoolImagePath(schoolId, kind));
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

/**
 * Upload one gallery photo and append it to `photos` (arrayUnion creates the array on
 * legacy docs). Unique timestamped path so photos never overwrite each other. The
 * BUSINESS_GALLERY_MAX cap (shared with businesses) is enforced by the panel UI. Must
 * be called by the owner/editor. Returns the stored URL.
 */
export async function addSchoolGalleryPhoto(
  schoolId: string,
  file: Blob,
): Promise<string> {
  const ref = storageRef(storage, `schools/${schoolId}/gallery/${Date.now()}`);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  await updateDoc(doc(db, SCHOOLS, schoolId), {
    photos: arrayUnion(url),
    updatedAt: serverTimestamp(),
  });
  return url;
}

/**
 * Remove a gallery photo (by its stored URL) from `photos` and best-effort delete the
 * Storage file — same contract as removeBusinessGalleryPhoto.
 */
export async function removeSchoolGalleryPhoto(
  schoolId: string,
  url: string,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId), {
    photos: arrayRemove(url),
    updatedAt: serverTimestamp(),
  });
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // Orphaned file (or an emulator URL ref() can't parse) — harmless.
  }
}

/**
 * Write the school's payment methods (private subcollection). The set REPLACES the
 * whole doc, so a legacy single `sinpe` is retired the first time the owner saves the
 * list. Editing payment data is always sensitive, so if the school is currently
 * `verified` we also drop the public doc to `needs_reverification` (which re-hides the
 * payment methods until admin re-approves).
 */
export async function updateSchoolPaymentMethods(
  id: string,
  paymentMethods: PaymentMethod[],
  currentStatus: School["verificationStatus"],
): Promise<void> {
  await setDoc(doc(db, SCHOOLS, id, "private", "data"), { paymentMethods });

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
  /** Linked school, or "" — linking is optional (the owner may add it later). */
  schoolId: string;
  schoolName: string; // denormalized; "" when no school is linked
  location: LocationInput;
  contact?: BusinessContact;
  /** Profile (avatar) image — uploaded to Storage, its URL stored as `logoUrl`. */
  logoFile?: Blob;
  /** Cover image — uploaded to Storage, its URL stored as `coverUrl` (the public
   * profile cover; see app/business/[slug]). */
  coverFile?: Blob;
}

/** Public Storage path of a business profile asset (public read via storage.rules). */
function businessImagePath(
  businessId: string,
  kind: "logo" | "cover",
): string {
  return `businesses/${businessId}/${kind}`;
}

async function uploadBusinessImage(
  businessId: string,
  kind: "logo" | "cover",
  file: Blob,
): Promise<string> {
  const ref = storageRef(storage, businessImagePath(businessId, kind));
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

/**
 * Upload one gallery photo and append it to `photos`. Unique timestamped path so
 * photos never overwrite each other. The BUSINESS_GALLERY_MAX cap is enforced by the
 * panel UI (the gallery manager hides the add control when full). Must be called by
 * the owner/editor. Returns the stored URL.
 */
export async function addBusinessGalleryPhoto(
  businessId: string,
  file: Blob,
): Promise<string> {
  const ref = storageRef(
    storage,
    `businesses/${businessId}/gallery/${Date.now()}`,
  );
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  await updateDoc(doc(db, BUSINESSES, businessId), {
    photos: arrayUnion(url),
    updatedAt: serverTimestamp(),
  });
  return url;
}

/**
 * Remove a gallery photo (by its stored URL) from `photos` and best-effort delete the
 * Storage file. The doc update is what un-publishes the photo; a failed file delete
 * only leaves an unreachable orphan, so it never fails the operation.
 */
export async function removeBusinessGalleryPhoto(
  businessId: string,
  url: string,
): Promise<void> {
  await updateDoc(doc(db, BUSINESSES, businessId), {
    photos: arrayRemove(url),
    updatedAt: serverTimestamp(),
  });
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // Orphaned file (or an emulator URL ref() can't parse) — harmless.
  }
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
  const slug = await uniqueBusinessSlug(input.name);
  const ref = doc(collection(db, BUSINESSES));
  // Images go up BEFORE the doc commit: the id already exists client-side, and a
  // failed upload must fail the whole creation (a page missing the images the owner
  // picked would publish broken). Files under a never-committed id are unreachable
  // orphans — harmless.
  const [logoUrl, coverUrl] = await Promise.all([
    input.logoFile
      ? uploadBusinessImage(ref.id, "logo", input.logoFile)
      : Promise.resolve(null),
    input.coverFile
      ? uploadBusinessImage(ref.id, "cover", input.coverFile)
      : Promise.resolve(null),
  ]);
  const batch = writeBatch(db);
  batch.set(ref, {
    name: input.name,
    slug,
    description: input.description,
    categories: input.categories,
    categoryNames: input.categoryNames,
    location: toLocation(input.location),
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    contact: input.contact ?? {},
    discount: { active: false, text: "" },
    ...(logoUrl ? { logoUrl } : {}),
    ...(coverUrl ? { coverUrl } : {}),
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
  linkPageToUser(batch, uid, "business", ref.id);
  await batch.commit();
  return ref.id;
}

/**
 * Statuses the owner may set from the panel: publish (`active`) / unpublish (`draft`).
 * `pending` and `suspended` are admin lifecycle states the panel never writes.
 */
export type BusinessPublishStatus = Extract<BusinessStatus, "draft" | "active">;

/**
 * Publish or unpublish a business page. Public reads filter by `status == 'active'`
 * (see lib/firestore/businesses.ts), so flipping this is what actually puts the profile
 * on — or takes it off — the catalog and its public URL.
 */
export async function setBusinessStatus(
  id: string,
  status: BusinessPublishStatus,
): Promise<void> {
  await updateDoc(doc(db, BUSINESSES, id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** Profile fields the owner edits from the panel (everything the edit form captures). */
export interface UpdateBusinessInput {
  name: string;
  description: string;
  categories: string[]; // category ids
  categoryNames: string[]; // denormalized
  /** Linked school, or "" — linking is optional (clearing it unlinks the school). */
  schoolId: string;
  schoolName: string; // denormalized; "" when no school is linked
  location: LocationInput;
  contact: BusinessContact;
  discount: Discount;
  hours?: string;
}

/**
 * Update the public business doc from the edit form. The slug is deliberately NOT
 * regenerated on rename: it is the public URL (shared on WhatsApp), so breaking inbound
 * links costs more than an outdated slug. `status` is handled separately
 * (setBusinessStatus); `ranking`/`reviewStats` are function-maintained and the rules
 * reject any client write that touches them.
 */
export async function updateBusinessProfile(
  id: string,
  input: UpdateBusinessInput,
): Promise<void> {
  await updateDoc(doc(db, BUSINESSES, id), {
    name: input.name,
    description: input.description,
    categories: input.categories,
    categoryNames: input.categoryNames,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    location: toLocation(input.location),
    contact: input.contact,
    discount: input.discount,
    hours: input.hours ?? "",
    updatedAt: serverTimestamp(),
  });
}

export interface CreateSchoolInput {
  name: string;
  description?: string;
  thankYouMessage?: string;
  location: Omit<LocationInput, "address">;
  boardContact: School["boardContact"];
  /** Optional payment methods; stored in the private subcollection, hidden until
   * verified. Informational only — the platform never processes payments. */
  paymentMethods?: PaymentMethod[];
}

/**
 * Create a school page owned by `uid` and link it to the user's managedPages. Schools
 * are self-administered but start unverified (`pending`): the payment methods stay hidden and an
 * "unverified data" banner shows until admin approves. Returns the new id.
 */
export async function createSchoolPage(
  uid: string,
  input: CreateSchoolInput,
): Promise<string> {
  const ref = doc(collection(db, SCHOOLS));
  const batch = writeBatch(db);
  batch.set(ref, {
    name: input.name,
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
  linkPageToUser(batch, uid, "school", ref.id);
  await batch.commit();

  // The payment-methods write stays OUTSIDE the batch: the private-subcollection rule
  // guards with get(schools/{id}), which reads pre-batch state — inside the batch the
  // school wouldn't exist yet and the whole commit would be denied.
  if (input.paymentMethods?.length) {
    await setDoc(doc(db, SCHOOLS, ref.id, "private", "data"), {
      paymentMethods: input.paymentMethods,
    });
  }

  // New school → drop the pickers' TTL cache so it is selectable immediately.
  invalidateSchoolsCache();
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
 * enforce it). `amount` is denormalized from `units`. The payment proof is uploaded
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
    firstConfirmedAt: null,
    expiresAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/**
 * Upload (or replace) the payment proof file for a subscription. The file goes to the
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
 *
 * On the FIRST confirmation it also stamps `firstConfirmedAt`, which renewals never
 * touch — that's what the response-time chip averages. The pre-read costs one get on a
 * panel action; without it a renewal couldn't tell itself apart from a first confirm.
 */
export async function confirmSubscription(
  id: string,
  confirmedBy: string,
  durationDays: number = SUBSCRIPTION_CONFIRMATION_DAYS,
): Promise<void> {
  const ref = doc(db, SUBSCRIPTIONS, id);
  const existing = (await getDoc(ref)).data();
  // Never confirmed before → this confirmation is the school's first response. A
  // legacy doc already confirmed (renewal without firstConfirmedAt) keeps it absent:
  // stamping "now" there would fake a slow response.
  const isFirstConfirmation = existing?.confirmedAt == null;
  await updateDoc(ref, {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    ...(isFirstConfirmation ? { firstConfirmedAt: serverTimestamp() } : {}),
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
// the payment proof; confirmed donations feed the donor's recognition tier via a Cloud
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
 * enforce `donorId == auth.uid`). The payment proof is uploaded separately with
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
    firstConfirmedAt: null,
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

// ── School projects (crowdfunding) ───────────────────────────────────────────
// A school lists concrete projects (e.g. "buy a water tank") with cost-justified stages.
// Anyone managing the school drafts/edits them; `raised`/`contributorsCount` are
// function-maintained from CONFIRMED contributions (the rules reject client writes to
// them). The platform never touches the money — contributions record a relationship the
// school confirms, exactly like subscriptions.

export interface CreateProjectInput {
  title: string;
  description: string;
  currency: ProjectCurrency;
  /** Ordered stages (cost-justified). The goal is the sum of their costs. */
  stages: ProjectStage[];
}

/**
 * Create an `active` project under a school. Must be called by the school owner/editor (the
 * rules enforce it). `raised`/`contributorsCount` start at 0 and are maintained by the
 * Cloud Function; `ownerId`/`schoolName` are denormalized from the school. Returns the id.
 */
export async function createProject(
  schoolId: string,
  schoolName: string,
  ownerId: string,
  input: CreateProjectInput,
): Promise<string> {
  const created = await addDoc(collection(db, SCHOOLS, schoolId, PROJECTS), {
    schoolId,
    schoolName,
    title: input.title,
    description: input.description,
    currency: input.currency,
    status: "active",
    stages: input.stages,
    raised: 0,
    contributorsCount: 0,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/** Fields of a project the board may edit. `raised`/`contributorsCount`/`status` are
 * handled elsewhere (function-maintained / setProjectStatus). */
export type ProjectPatch = Partial<{
  title: string;
  description: string;
  currency: ProjectCurrency;
  stages: ProjectStage[];
  coverUrl: string;
}>;

/** Update a project's editable fields. Must be called by the school owner/editor. */
export async function updateProject(
  schoolId: string,
  projectId: string,
  patch: ProjectPatch,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Open/close a project. Reaching the money goal never auto-closes it (buying the tank
 * still has to happen), so `completed` is always a manual board action — also the way an
 * accepted in-kind donation fulfils a project.
 */
export async function setProjectStatus(
  schoolId: string,
  projectId: string,
  status: ProjectStatus,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a project. Must be called by the school owner/editor. Past contributions are
 * left as-is (history); the function simply stops recomputing a missing project. */
export async function deleteProject(
  schoolId: string,
  projectId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId));
}

/**
 * Upload a project asset (the cover, a stage photo or a stage quote) to the public school
 * Storage namespace and return its URL. Unique timestamped path so files never overwrite.
 * The caller persists the URL via updateProject (cover) or by writing it into the stages
 * array. `kind` only shapes the path for readability.
 */
export async function uploadProjectAsset(
  schoolId: string,
  projectId: string,
  kind: "cover" | "photo" | "quote",
  file: Blob,
): Promise<string> {
  const ref = storageRef(
    storage,
    `schools/${schoolId}/projects/${projectId}/${kind}-${Date.now()}`,
  );
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

export interface CreateContributionInput {
  schoolId: string;
  schoolName: string; // denormalized
  projectId: string;
  projectTitle: string; // denormalized
  currency: ProjectCurrency; // copied from the project
  donorId: string;
  donorName: string; // denormalized
  type: ProjectContributionType;
  /** Money: amount paid. In-kind: assessed value (cost of the stage covered, or a
   * fraction). Both feed the progress bar once confirmed. */
  amount: number;
  /** What is being donated, for in-kind contributions. */
  description?: string;
  /** Stage this contribution covers (index into the project's stages), if tied to one. */
  stageIndex?: number;
  /** Snapshot of that stage's title, for the confirmation queue. */
  stageTitle?: string;
}

/**
 * Create a `pending` contribution to a project. Must be called by the signed-in donor
 * (the rules enforce `donorId == auth.uid` and that the school is verified). The payment
 * proof / evidence is uploaded separately. Returns the new id.
 */
export async function createContribution(
  input: CreateContributionInput,
): Promise<string> {
  const created = await addDoc(collection(db, PROJECT_CONTRIBUTIONS), {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    type: input.type,
    donorId: input.donorId,
    donorName: input.donorName,
    amount: input.amount,
    currency: input.currency,
    // Conditional spread: Firestore rejects explicit `undefined`.
    ...(input.description ? { description: input.description } : {}),
    ...(input.stageIndex != null ? { stageIndex: input.stageIndex } : {}),
    ...(input.stageTitle ? { stageTitle: input.stageTitle } : {}),
    status: "pending",
    confirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/**
 * Upload (or replace) the payment proof for a contribution. The file goes to the private
 * Storage path (gated by storage.rules to the contributor / school / admin); only the
 * non-sensitive `proofUploaded` flag is written to the public doc.
 */
export async function uploadContributionProof(
  contributionId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(
    storageRef(storage, contributionProofPath(contributionId)),
    file,
  );
  await updateDoc(doc(db, PROJECT_CONTRIBUTIONS, contributionId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Confirm a contribution. Must be called by the school's board (owner/editors) or admin.
 * Stamps `confirmedAt`/`confirmedBy`; a Cloud Function then recomputes the project's
 * `raised`/`contributorsCount`. One-off, so there is no expiry to set (unlike a
 * subscription renewal).
 */
export async function confirmContribution(
  id: string,
  confirmedBy: string,
): Promise<void> {
  await updateDoc(doc(db, PROJECT_CONTRIBUTIONS, id), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    updatedAt: serverTimestamp(),
  });
}
