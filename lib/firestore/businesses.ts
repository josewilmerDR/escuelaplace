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
  documentId,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
  BusinessPrivate,
  BusinessStatus,
  Discount,
} from "@/types";
import { chunkedInQuery, docToTyped, snapToList } from "./converters";
import { toLocation, type LocationInput } from "./geo";
import { linkPageToUser } from "./users";
import { getConfirmedSubscriptionsBySchool } from "./subscriptions";
import { recentBusinessSupporterIds } from "./ranking";
import { revalidateBusinessCatalog } from "@/lib/revalidate";

const BUSINESSES = "businesses";

/**
 * Businesses of a school, ordered by ranking.score (desc). Active only.
 *
 * Wrapped in React cache(): the public school profile reads it from both the shared
 * layout (to decide tab visibility) and the "Comercios" page during one request — the
 * cache dedupes that into a single Firestore query.
 */
export const getBusinessesBySchool = cache(
  async (schoolId: string, max = 50): Promise<BusinessDoc[]> => {
    const q = query(
      collection(db, BUSINESSES),
      where("schoolId", "==", schoolId),
      where("status", "==", "active"),
      orderBy("ranking.score", "desc"),
      fbLimit(max),
    );
    return snapToList<Business>(await getDocs(q));
  },
);

/**
 * Active businesses for an arbitrary set of ids, fetched in chunked `in` queries over
 * `documentId()` (a handful of reads, not N+1). Draft/suspended businesses are dropped in
 * memory — a non-active business must never surface as a public card, even when something
 * still references it. The returned order is NOT the input order (Firestore `in` doesn't
 * preserve it); callers that need a specific order sort the result themselves.
 *
 * The by-id counterpart to getBusinessesBySchool: it hydrates business docs from ids that
 * come from a DIFFERENT relationship than the linked `schoolId` — e.g. the confirmed
 * supporters of a school (getSupportingBusinesses).
 */
export async function getBusinessesByIds(
  ids: string[],
): Promise<BusinessDoc[]> {
  return (await chunkedInQuery<Business>(BUSINESSES, documentId(), ids)).filter(
    (b) => b.status === "active",
  );
}

/**
 * The active businesses that actually SUPPORT a school, ordered by ranking.score (desc) —
 * the correct "Comercios que apoyan a la escuela" set.
 *
 * Resolves the relationship the RIGHT way: from the school's confirmed subscriptions (the
 * support relationship), NOT from the business's linked `schoolId`. A business that
 * supports this school but is linked to another school (or to none) genuinely collaborates
 * and MUST appear — getBusinessesBySchool would wrongly drop it. recentBusinessSupporterIds
 * applies the same recent-confirmed predicate as the header's supporters chip, so the
 * carousel, the Comercios tab and the chip never disagree.
 *
 * Wrapped in React cache(): the school layout (supporter count + CTA), the Comercios tab and
 * the landing teaser all read it during one request — the cache collapses that into a single
 * hydration read. getConfirmedSubscriptionsBySchool is cache()'d too, so the subscriptions
 * read is shared with the layout's support metrics.
 */
export const getSupportingBusinesses = cache(
  async (schoolId: string): Promise<BusinessDoc[]> => {
    const confirmedSubs = await getConfirmedSubscriptionsBySchool(schoolId);
    const supporterIds = [...recentBusinessSupporterIds(confirmedSubs)];
    const businesses = await getBusinessesByIds(supporterIds);
    return businesses.sort(
      (a, b) => (b.ranking?.score ?? 0) - (a.ranking?.score ?? 0),
    );
  },
);

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

/**
 * The business's private, owner-only contact details (currently the email) from the private
 * subcollection — kept off the world-readable doc (finding #13). Readable by the business
 * owner/editors or admin (see rules). Best-effort: returns null when the doc is missing OR the
 * caller isn't authorized, so the edit form can add it to its initial load without a denied
 * read breaking the page for a non-manager (who is shown the "not your business" notice anyway).
 * Never used for public rendering.
 */
export async function getBusinessPrivate(
  id: string,
): Promise<BusinessPrivate | null> {
  try {
    const snap = await getDoc(doc(db, BUSINESSES, id, "private", "data"));
    return snap.exists() ? (snap.data() as BusinessPrivate) : null;
  } catch {
    return null;
  }
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
  /** Search keywords. Caller normalizes with `normalizeTags` before passing. */
  tags?: string[];
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
  // Best-effort: refresh the public business page so the new photo shows without the ISR lag.
  await revalidateBusinessCatalog().catch(() => {});
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
  // Best-effort: refresh the public business page so the removed photo drops without the lag.
  await revalidateBusinessCatalog().catch(() => {});
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
  // The Firestore doc is committed FIRST, before any image upload: the Storage rules gate
  // `businesses/{id}/**` writes on the parent doc's ownerId (storage.rules), so the
  // logo/cover uploads are denied with 403 (storage/unauthorized) unless `businesses/{id}`
  // already exists with this uid as owner. The reverse order (upload then commit) fails
  // closed because the parent doc the rule reads does not exist yet.
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
    photos: [],
    tags: input.tags ?? [],
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

  // With the doc in place the uploads now pass the ownership-gated Storage rules. A failed
  // upload must still fail the whole creation (a page missing the images the owner picked
  // would publish broken), so on error we roll the doc + the user link back rather than
  // leaving a half-created draft.
  if (input.logoFile || input.coverFile) {
    try {
      const [logoUrl, coverUrl] = await Promise.all([
        input.logoFile
          ? uploadBusinessImage(ref.id, "logo", input.logoFile)
          : Promise.resolve(null),
        input.coverFile
          ? uploadBusinessImage(ref.id, "cover", input.coverFile)
          : Promise.resolve(null),
      ]);
      await updateDoc(ref, {
        ...(logoUrl ? { logoUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const rollback = writeBatch(db);
      rollback.delete(ref);
      rollback.update(doc(db, "users", uid), {
        managedPages: arrayRemove({ type: "business", id: ref.id, role: "owner" }),
      });
      await rollback.commit().catch(() => {});
      throw err;
    }
  }
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
  // Publishing/unpublishing is exactly what adds or removes the business from the catalog,
  // so refresh the listings + its page immediately instead of waiting out the ISR window.
  await revalidateBusinessCatalog().catch(() => {});
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
  /** Owner contact email — persisted to the PRIVATE subcollection, never the public doc
   * (finding #13). "" clears it. */
  email?: string;
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
  // The owner email goes to the PRIVATE subcollection FIRST, then the public doc — so a
  // partial failure can never scrub the public email (the public write below replaces the
  // whole `contact` map, dropping any legacy `contact.email`) without it being saved here.
  // setDoc REPLACES the one-field doc, so an empty email clears it (finding #13).
  const email = input.email?.trim();
  await setDoc(
    doc(db, BUSINESSES, id, "private", "data"),
    email ? { email } : {},
  );
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
  // Name/categories/discount/images all surface in the feed, the listings and the public
  // page — refresh them now so an edit isn't invisible for up to the ISR window.
  await revalidateBusinessCatalog().catch(() => {});
}
