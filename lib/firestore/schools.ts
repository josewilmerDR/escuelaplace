/**
 * Typed reads AND writes of the `schools` collection. Reads run from server components
 * (SSR) and the panel; writes (creation, profile edits, gallery, payment methods) run
 * client-side from the owner's panel.
 *
 * The private subcollection (payment methods) is gated separately: owner/editors/admin
 * always; everyone else only through getVerifiedSchoolPaymentMethods.
 *
 * School verification rule (schools only): editing a sensitive field (name or payment
 * methods) of an already-verified school drops it back to `needs_reverification` so the
 * payment data is hidden and the "unverified data" banner reappears until admin
 * re-approves. Owners can never set `verified`/`verificationStatus` to verified — only
 * admin can (see firestore.rules).
 */
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
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
import { cache } from "react";
import { db, storage } from "@/lib/firebase";
import type { PaymentMethod, School, SchoolDoc, SchoolPrivate } from "@/types";
import { docToTyped, snapToList } from "./converters";
import { toLocation, type LocationInput } from "./geo";
import { linkPageToUser } from "./users";
import { revalidateSchoolCatalog } from "@/lib/revalidate";

const SCHOOLS = "schools";

/**
 * A school by document id. Returns null if it does not exist.
 *
 * Wrapped in React cache(): the public school page's generateMetadata and the page
 * component both read the same school during one request — the cache dedupes that into a
 * single Firestore read (the Firestore SDK, unlike fetch, gets no deduping from Next).
 */
export const getSchoolById = cache(
  async (id: string): Promise<SchoolDoc | null> => {
    return docToTyped<School>(await getDoc(doc(db, SCHOOLS, id)));
  },
);

/** Whether a school has been verified by an admin. */
export function isSchoolVerified(
  school: Pick<SchoolDoc, "verificationStatus">,
): boolean {
  return school.verificationStatus === "verified";
}

/**
 * Cover-slot image for a school: explicit cover, else first gallery photo, else profile
 * photo, else undefined. Pure — used by the public page for both its metadata/OG image
 * and the header cover so the two never drift. Presentation (contain vs full-bleed)
 * stays in the page.
 */
export function schoolCover(
  school: Pick<SchoolDoc, "coverUrl" | "photos" | "photoUrl">,
): string | undefined {
  return school.coverUrl ?? school.photos?.[0] ?? school.photoUrl;
}

/**
 * Schools open for selection (pickers, support/donation flows), ordered by name.
 * Deliberately includes `pending`: a just-created school must be selectable by buyers
 * and by the business that wants to support it — verification gates the payment methods
 * (see getVerifiedSchoolPaymentMethods), not the school's presence in lists. Only `inactive`
 * (delisted) schools are excluded.
 *
 * The cap exists so a runaway collection can't blow up every picker mount; schools
 * beyond it silently disappear from selectors, so it is set well above the current
 * volume. If the directory ever outgrows it, the pickers (Combobox) should switch to
 * querying by name prefix instead of raising it again.
 */
export async function getSchools(max = 500): Promise<SchoolDoc[]> {
  const q = query(
    collection(db, SCHOOLS),
    where("status", "in", ["active", "pending"]),
    orderBy("name"),
    fbLimit(max),
  );
  return snapToList<School>(await getDocs(q));
}

const SCHOOLS_CACHE_TTL_MS = 5 * 60_000;
let schoolsCache: { at: number; data: SchoolDoc[] } | null = null;

/**
 * `getSchools()` behind a module-level TTL cache. The school list changes rarely but is
 * read by the community picker on every page that mounts it (/, /search, /category/*) —
 * without the cache each client navigation pays a full ~100-doc Firestore read and the
 * combobox flashes empty while it loads. Errors are not cached (next call retries).
 */
export async function getSchoolsCached(): Promise<SchoolDoc[]> {
  if (schoolsCache && Date.now() - schoolsCache.at < SCHOOLS_CACHE_TTL_MS) {
    return schoolsCache.data;
  }
  const data = await getSchools();
  schoolsCache = { at: Date.now(), data };
  return data;
}

/**
 * Drop the TTL cache. Called right after creating a school so the pickers (create
 * business, donate, subscribe) list it immediately instead of after the TTL.
 */
export function invalidateSchoolsCache(): void {
  schoolsCache = null;
}

/**
 * The school's sensitive payment data from the private subcollection.
 * Reading requires Firestore auth as the school's owner/editors or admin (see rules);
 * this is for the owner panel / admin, NOT for public rendering.
 */
export async function getSchoolPrivate(
  id: string,
): Promise<SchoolPrivate | null> {
  const snap = await getDoc(doc(db, SCHOOLS, id, "private", "data"));
  return snap.exists() ? (snap.data() as SchoolPrivate) : null;
}

/**
 * The bare datum a donor actually re-types into their bank app — the part worth not
 * making them clean up by hand. Strips a trailing human annotation in parentheses, e.g.
 * "88882222 (Junta de Educación Rep. Argentina)" → "88882222", because the published
 * value commonly carries the account holder for context but only the number/account/handle
 * is the transaction input. Conservative and pure: removes only a single clean trailing
 * "(…)" group (no nested parens), trims surrounding space, and never reduces to empty (a
 * value that is wholly parenthetical is copied as-is).
 */
export function barePaymentValue(value: string): string {
  const stripped = value.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return stripped || value.trim();
}

/** Stored {label, value} entries of a private doc, folding the legacy single SINPE
 * (docs predating `paymentMethods`) into an equivalent entry. The raw, persisted shape. */
function storedPaymentMethods(
  priv: SchoolPrivate | null | undefined,
): PaymentMethod[] {
  if (priv?.paymentMethods?.length) return priv.paymentMethods;
  if (priv?.sinpe?.number) {
    return [
      {
        label: "SINPE Móvil",
        value: priv.sinpe.accountHolder
          ? `${priv.sinpe.number} (${priv.sinpe.accountHolder})`
          : priv.sinpe.number,
      },
    ];
  }
  return [];
}

/**
 * The payment-method list enriched for read-time DISPLAY: each entry keeps the published
 * `value` (which may carry an account holder or other context — useful to the donor) but,
 * when that value isn't already the bare datum, exposes `copyValue` so the "Copiar"
 * affordance puts only the transaction input on the clipboard, not the parenthetical note.
 * Pure. Use this for anything the supporter sees; the edit form / admin / writes use
 * `paymentMethodsOf` (the stored shape), so the display hint is never persisted.
 */
export function displayPaymentMethodsOf(
  priv: SchoolPrivate | null | undefined,
): PaymentMethod[] {
  return storedPaymentMethods(priv).map((m) => {
    const bare = barePaymentValue(m.value);
    return bare === m.value ? m : { ...m, copyValue: bare };
  });
}

/**
 * The STORED payment-method shape ({ label, value } only) — same normalization without the
 * read-time `copyValue` hint. Used to seed the owner's edit form and the admin review
 * (which persist/round-trip the list), so a display-only field never leaks into Firestore.
 */
export function paymentMethodsOf(
  priv: SchoolPrivate | null | undefined,
): PaymentMethod[] {
  return storedPaymentMethods(priv).map(({ label, value }) => ({ label, value }));
}

/**
 * The payment methods intended for display to supporters (donors and businesses wanting
 * to subscribe), gated by verification: returns null unless the school is in
 * `verificationStatus === 'verified'` ([] when verified but none published yet).
 * Centralizes the "hide payment data until verified / on re-verification" business rule
 * so no caller can accidentally surface unverified payment data.
 */
export async function getVerifiedSchoolPaymentMethods(
  id: string,
): Promise<PaymentMethod[] | null> {
  const school = await getSchoolById(id);
  if (!school || school.verificationStatus !== "verified") return null;
  // Display path → keep the copyValue hint so the supporter's "Copiar" copies the bare datum.
  return displayPaymentMethodsOf(await getSchoolPrivate(id));
}

// ── Writes (owner panel) ─────────────────────────────────────────────────────

/** Fields of the public school doc an owner may edit through the panel. The location
 * comes as raw form input (lat/lng + admin levels) and is converted with toLocation so
 * the geohash is always recomputed when the pin moves. */
export type SchoolProfilePatch = Partial<
  Pick<
    School,
    "name" | "description" | "thankYouMessage" | "photos" | "boardContact"
  >
> & {
  location?: Omit<LocationInput, "address">;
  /** Profile/cover image URLs. A string sets the URL; `null` deletes the field (e.g.
   * the owner removed the cover — set "" would defeat schoolCover's `?? photos[0]`
   * fallback, so a real field delete is required). */
  photoUrl?: string | null;
  coverUrl?: string | null;
};

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

  const { location, photoUrl, coverUrl, ...rest } = patch;
  await updateDoc(doc(db, SCHOOLS, id), {
    ...rest,
    // null → deleteField() so the public schoolCover() falls back correctly instead of
    // resolving to an empty-string cover (a removal must clear the field, not blank it).
    ...(photoUrl !== undefined
      ? { photoUrl: photoUrl === null ? deleteField() : photoUrl }
      : {}),
    ...(coverUrl !== undefined
      ? { coverUrl: coverUrl === null ? deleteField() : coverUrl }
      : {}),
    ...(location ? { location: toLocation(location) } : {}),
    ...(dropsVerification
      ? { verified: false, verificationStatus: "needs_reverification" }
      : {}),
    updatedAt: serverTimestamp(),
  });

  // A rename must reach the pickers (donate, subscribe, community combobox) before
  // their TTL cache would naturally expire.
  if ("name" in patch) invalidateSchoolsCache();

  // Best-effort: refresh the school's public pages + the directory without the ISR lag.
  await revalidateSchoolCatalog(id).catch(() => {});
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
  // Best-effort: refresh the school's public page so the new photo shows without the lag.
  await revalidateSchoolCatalog(schoolId).catch(() => {});
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
  // Best-effort: refresh the school's public page so the removed photo drops without the lag.
  await revalidateSchoolCatalog(schoolId).catch(() => {});
}

/**
 * Write the school's payment methods (private subcollection). The set REPLACES the
 * whole doc, so a legacy single `sinpe` is retired the first time the owner saves the
 * list. Editing payment data is always sensitive, so if the school is currently
 * `verified` we first drop the public doc to `needs_reverification` (which re-hides the
 * payment methods until admin re-approves) and ONLY THEN write the methods — the rules
 * reject a payment-method write while the school is still 'verified' (it must be dropped
 * first), so the order matters.
 */
export async function updateSchoolPaymentMethods(
  id: string,
  paymentMethods: PaymentMethod[],
  currentStatus: School["verificationStatus"],
): Promise<void> {
  if (currentStatus === "verified") {
    await updateDoc(doc(db, SCHOOLS, id), {
      verified: false,
      verificationStatus: "needs_reverification",
      updatedAt: serverTimestamp(),
    });
  }

  await setDoc(doc(db, SCHOOLS, id, "private", "data"), { paymentMethods });

  // The school page shows/hides the methods by verification state, which this write can
  // flip — refresh it (and the directory) so the change is visible right away.
  await revalidateSchoolCatalog(id).catch(() => {});
}

// ── Admin: school verification ───────────────────────────────────────────────

/**
 * Schools awaiting an admin decision: `pending` (never verified) or
 * `needs_reverification` (a sensitive field changed after being verified). Sorted oldest
 * first so the queue is fair (first-created, first-reviewed).
 *
 * A single `in` filter needs no composite index; the ordering is done in memory because
 * the queue is small by nature (only unverified schools). Reads run from the admin panel;
 * the school doc is public, but the review screen also pulls each school's private payment
 * methods via getSchoolPrivate (admin-readable by rules) so the admin can vet them.
 */
export async function getSchoolsAwaitingVerification(): Promise<SchoolDoc[]> {
  const q = query(
    collection(db, SCHOOLS),
    where("verificationStatus", "in", ["pending", "needs_reverification"]),
  );
  const list = snapToList<School>(await getDocs(q));
  return list.sort(
    (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0),
  );
}

/**
 * Approve a school: set `verified` / `verificationStatus: 'verified'`. Admin only — the
 * rules reject this write from anyone else (see grantsVerification in firestore.rules).
 * Once verified the payment methods become readable to supporters and the "unverified
 * data" banner clears.
 */
export async function verifySchool(id: string): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, id), {
    verified: true,
    verificationStatus: "verified",
    updatedAt: serverTimestamp(),
  });
  // Verifying clears the banner, reveals the payment methods and changes the school's
  // ranking weight — refresh its public pages + the directory/home right away.
  await revalidateSchoolCatalog(id).catch(() => {});
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
  /** Profile (avatar) image — uploaded to Storage, its URL stored as `photoUrl`. */
  photoFile?: Blob;
  /** Cover image — uploaded to Storage, its URL stored as `coverUrl` (the public
   * page cover; see app/school/[id]). */
  coverFile?: Blob;
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
  // The Firestore doc is committed FIRST, before any image upload: the Storage rules gate
  // `schools/{id}/**` writes on the parent doc's ownerId (storage.rules), so the
  // photo/cover uploads are denied with 403 (storage/unauthorized) unless `schools/{id}`
  // already exists with this uid as owner. The reverse order (upload then commit) fails
  // closed because the parent doc the rule reads does not exist yet.
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

  // With the doc in place the uploads now pass the ownership-gated Storage rules. A failed
  // upload must still fail the whole creation (a page missing the images the owner picked
  // would publish broken), so on error we roll the doc + the user link back rather than
  // leaving a half-created draft. Image changes are not sensitive, so they never affect
  // verification (the school is born unverified regardless).
  if (input.photoFile || input.coverFile) {
    try {
      const [photoUrl, coverUrl] = await Promise.all([
        input.photoFile
          ? uploadSchoolImage(ref.id, "photo", input.photoFile)
          : Promise.resolve(null),
        input.coverFile
          ? uploadSchoolImage(ref.id, "cover", input.coverFile)
          : Promise.resolve(null),
      ]);
      await updateDoc(ref, {
        ...(photoUrl ? { photoUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const rollback = writeBatch(db);
      rollback.delete(ref);
      rollback.update(doc(db, "users", uid), {
        managedPages: arrayRemove({ type: "school", id: ref.id, role: "owner" }),
      });
      await rollback.commit().catch(() => {});
      invalidateSchoolsCache();
      throw err;
    }
  }

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

  // A new school is publicly listed right away (getSchools includes `pending`), so refresh
  // the directory + home without waiting out the ISR window.
  await revalidateSchoolCatalog(ref.id).catch(() => {});
  return ref.id;
}
