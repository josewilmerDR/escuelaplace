/**
 * Typed reads AND writes of the `businesses` collection. Reads run from server components
 * (SSG/SSR) for SEO; writes (creation, profile edits, gallery, publish/unpublish) run
 * client-side from the owner's panel. Keeping both here means everything about a business
 * lives in one file.
 */
import { cache } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type {
  Business,
  BusinessContact,
  BusinessDoc,
  BusinessStatus,
  Discount,
} from "@/types";
import { docToTyped, snapToList } from "./converters";
import { toLocation, type LocationInput } from "./geo";
import { linkPageToUser } from "./users";

const BUSINESSES = "businesses";

/** Businesses of a school, ordered by ranking.score (desc). Active only. */
export async function getBusinessesBySchool(
  schoolId: string,
  max = 50,
): Promise<BusinessDoc[]> {
  const q = query(
    collection(db, BUSINESSES),
    where("schoolId", "==", schoolId),
    where("status", "==", "active"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Business>(await getDocs(q));
}

/**
 * An active business by its unique slug. Returns null if it does not exist OR is not
 * publicly visible (draft/pending/suspended): the public profile is the only consumer,
 * and pausing a page must actually unpublish it — without the status filter a paused
 * business stayed reachable (and indexable) by direct link.
 *
 * Wrapped in React cache(): generateMetadata and the page component both call it with
 * the same slug during one request — the cache dedupes that into a single Firestore
 * query (the Firestore SDK, unlike fetch, gets no deduping from Next).
 */
export const getBusinessBySlug = cache(
  async (slug: string): Promise<BusinessDoc | null> => {
    const q = query(
      collection(db, BUSINESSES),
      where("slug", "==", slug),
      where("status", "==", "active"),
      fbLimit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return docToTyped<Business>(snap.docs[0]);
  },
);

/** A business by document id. */
export async function getBusinessById(
  id: string,
): Promise<BusinessDoc | null> {
  return docToTyped<Business>(await getDoc(doc(db, BUSINESSES, id)));
}

/** Businesses of a category, ordered by ranking.score (desc). Active only. */
export async function getBusinessesByCategory(
  categoryId: string,
  max = 50,
): Promise<BusinessDoc[]> {
  const q = query(
    collection(db, BUSINESSES),
    where("categories", "array-contains", categoryId),
    where("status", "==", "active"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Business>(await getDocs(q));
}

/**
 * Active businesses ordered by the stored baseline `ranking.score` (desc). This is the
 * SSR/SEO baseline order; the client re-ranks it per the buyer's community on top (see
 * `rankBusinessFeed`). Search fetches a generous set and gates it by relevance in memory.
 */
export async function getActiveBusinesses(max = 200): Promise<BusinessDoc[]> {
  const q = query(
    collection(db, BUSINESSES),
    where("status", "==", "active"),
    orderBy("ranking.score", "desc"),
    fbLimit(max),
  );
  return snapToList<Business>(await getDocs(q));
}

/** Top active businesses for the explore feed. Thin wrapper over `getActiveBusinesses`. */
export function getTopBusinesses(max = 24): Promise<BusinessDoc[]> {
  return getActiveBusinesses(max);
}

const ACTIVE_BUSINESSES_CACHE_TTL_MS = 5 * 60_000; // 300s, matching the catalog ISR window
let activeBusinessesCache: { at: number; max: number; data: BusinessDoc[] } | null =
  null;

/**
 * `getActiveBusinesses()` behind a module-level TTL cache (mirrors getSchoolsCached). The
 * candidate set search starts from — "top-N active businesses by ranking.score" — is
 * query-independent and identical to what the home feed reads, yet /search re-read it from
 * Firestore on every keystroke/query. Caching it like the home feed (same 300s window the
 * catalog uses for home/category ISR) means repeated searches reuse one read instead of
 * paying a full ~200-doc Firestore read each time. The cache key includes `max` so a
 * larger request never returns a smaller cached set; errors are not cached (next call
 * retries).
 */
export async function getActiveBusinessesCached(
  max = 200,
): Promise<BusinessDoc[]> {
  if (
    activeBusinessesCache &&
    activeBusinessesCache.max === max &&
    Date.now() - activeBusinessesCache.at < ACTIVE_BUSINESSES_CACHE_TTL_MS
  ) {
    return activeBusinessesCache.data;
  }
  const data = await getActiveBusinesses(max);
  activeBusinessesCache = { at: Date.now(), max, data };
  return data;
}

// ── Writes (owner panel) ─────────────────────────────────────────────────────

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

/**
 * Upload (or replace) the business's profile logo or cover and return its URL. Used by
 * the create form (before the doc commit) and the edit page (the caller persists the URL
 * via updateBusinessProfile as logoUrl/coverUrl). Mirrors uploadSchoolImage; image
 * changes are not sensitive, so — unlike schools — businesses have no re-verification.
 */
export async function uploadBusinessImage(
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
    tags: [],
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
 * (see getBusinessBySlug above), so flipping this is what actually puts the profile
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
  /** Search keywords. Caller normalizes with `normalizeTags` before passing. */
  tags: string[];
  hours?: string;
  /** New profile logo URL (already uploaded). Omit to keep the stored one. */
  logoUrl?: string;
  /** New cover URL (already uploaded). Omit to keep the stored one. */
  coverUrl?: string;
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
    tags: input.tags,
    hours: input.hours ?? "",
    // Only written when a new image was uploaded this save; otherwise the stored URL
    // stands (the patch must never blank out an unchanged logo/cover).
    ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
    ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
    updatedAt: serverTimestamp(),
  });
}
