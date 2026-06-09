/**
 * Firestore collection types for escuelaplace.com
 *
 * Conventions:
 * - Timestamps typed as `Timestamp` (firebase/firestore). In server components they
 *   are serialized to string/number before being passed to client components.
 * - Deliberate denormalization: fields like `schoolName` or `categoryNames` are copied
 *   into the document to avoid extra reads when rendering.
 * - Geo stores `geopoint` (GeoPoint) + `geohash` (string computed with geofire-common)
 *   so proximity queries by geohash range are possible.
 * - Sensitive data (the school's SINPE) does NOT live in the public doc: it goes in the
 *   private subcollection `schools/{id}/private/data` (see `SchoolPrivate`).
 */
import type { GeoPoint, Timestamp } from "firebase/firestore";

// ── Shared types ─────────────────────────────────────────────────────────────

export interface Location {
  geopoint: GeoPoint;
  geohash: string;
  address?: string;
  province: string;
  canton: string;
  district: string;
}

export interface BusinessContact {
  whatsapp?: string;
  phone?: string;
  email?: string;
  web?: string;
  instagram?: string;
  facebook?: string;
}

export interface Discount {
  active: boolean;
  text: string;
  percentage?: number;
}

/**
 * Platform plan summary embedded in the business doc. This is NOT the support
 * relationship with a school (see the first-class `Subscription` entity below); it is a
 * lightweight per-business flag. Kept for backward compatibility with existing docs.
 */
export interface BusinessPlan {
  active: boolean;
  plan: string;
  /** Date until which the plan is valid. */
  validUntil: Timestamp | null;
}

export interface BusinessRanking {
  /** Score computed to order businesses within a school. */
  score: number;
  /** Total amount donated/contributed (informational for the ranking). */
  totalDonated: number;
}

export interface BusinessMetrics {
  views: number;
  interactions: number;
}

/**
 * Aggregate of a business's reviews, denormalized onto the business doc. Maintained by a
 * Cloud Function (onReviewWritten) — clients must NOT write it (see firestore.rules). Feeds
 * the quality signal Q in the ranking (see qualityScore).
 */
export interface ReviewStats {
  count: number;
  /** Mean rating in [1,5]; 0 when there are no reviews. */
  average: number;
}

export type BusinessStatus = "draft" | "pending" | "active" | "suspended";
export type SchoolStatus = "pending" | "active" | "inactive";

/**
 * Verification lifecycle for schools. Schools are self-administered (anyone signed in
 * can create one), so sensitive data must be admin-vetted:
 * - `pending`: just created, never verified. SINPE hidden, "unverified" banner shown.
 * - `verified`: admin approved. SINPE visible to businesses wanting to subscribe.
 * - `needs_reverification`: owner edited a sensitive field (name or SINPE) after being
 *   verified. SINPE is hidden again and the banner reappears until admin re-approves.
 * Only admin may write this field (the owner cannot self-verify; see firestore.rules).
 */
export type SchoolVerificationStatus =
  | "pending"
  | "verified"
  | "needs_reverification";

// ── businesses/{id} ──────────────────────────────────────────────────────────

export interface Business {
  name: string;
  slug: string;
  description: string;
  categories: string[]; // category ids
  categoryNames: string[]; // denormalized for rendering without extra reads
  location: Location;
  schoolId: string;
  schoolName: string; // denormalized
  contact: BusinessContact;
  discount: Discount;
  logoUrl?: string;
  photos: string[];
  hours?: string;
  status: BusinessStatus;
  verified: boolean;
  subscription: BusinessPlan;
  ranking: BusinessRanking;
  metrics: BusinessMetrics;
  /** Review aggregate (function-maintained). Defaults to {count:0, average:0}. */
  reviewStats: ReviewStats;
  ownerId: string; // uid of the owner user who administers this business page
  /** uids of co-administrators allowed to edit the page (optional). */
  editorIds?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Business with its document id included (what the data layer returns). */
export type BusinessDoc = Business & { id: string };

/**
 * Plain, JSON-serializable subset of a business for rendering cards. Server components map
 * `BusinessDoc` to this (dropping non-serializable Timestamp/GeoPoint values) before
 * handing it to client components for the progressive re-rank. `ranking.score` is kept so
 * the client re-rank can tie-break by the stored baseline.
 */
export interface BusinessCardData {
  id: string;
  name: string;
  slug: string;
  schoolId: string;
  schoolName: string;
  categoryNames: string[];
  logoUrl?: string;
  /** First photo, if any. */
  photo?: string;
  discount?: Discount;
  ranking: { score: number };
  /** Review aggregate, so the client re-rank can compute the quality signal Q. */
  reviewStats: ReviewStats;
}

// ── schools/{id} ─────────────────────────────────────────────────────────────

export interface BoardContact {
  name: string;
  phone?: string;
  email?: string;
}

export interface SchoolMetrics {
  supportingBusinesses: number;
}

export interface School {
  name: string;
  mepCode: string;
  description: string;
  thankYouMessage: string;
  location: Omit<Location, "address">;
  photoUrl?: string;
  boardContact: BoardContact;
  status: SchoolStatus;
  verified: boolean;
  /**
   * Verification lifecycle (see SchoolVerificationStatus). Drives whether the SINPE is
   * exposed publicly and whether the "unverified data" banner is shown. Admin-only write.
   */
  verificationStatus: SchoolVerificationStatus;
  metrics: SchoolMetrics;
  /** uid of the user who administers this school page (the board). */
  ownerId: string;
  /** uids of co-administrators allowed to edit the page (optional). */
  editorIds?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SchoolDoc = School & { id: string };

/**
 * Private subcollection: schools/{id}/private/data
 * Sensitive data. ONLY admin can read/write (see firestore.rules).
 * NEVER included in the public school document.
 */
export interface SchoolPrivate {
  sinpe: {
    number: string;
    accountHolder: string;
  };
}

// ── users/{uid} ──────────────────────────────────────────────────────────────

/**
 * Global account role. Only distinguishes `admin` from regular users; the role a user
 * holds *on a specific page* lives in `managedPages[].role`, not here.
 */
export type UserRole = "user" | "admin";

export type PageType = "business" | "school";
export type PageRole = "owner" | "editor";

/**
 * A page (business or school) administered by a user, Facebook-style. A single account
 * may manage several pages of either type. Used by the panel to list what the user can
 * edit; access control itself is enforced on the page doc (ownerId/editorIds), not here.
 */
export interface ManagedPage {
  type: PageType;
  id: string;
  role: PageRole;
}

export interface User {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  /** Pages (businesses and/or schools) this account administers. */
  managedPages: ManagedPage[];
  createdAt: Timestamp;
}

export type UserDoc = User & { id: string };

// ── categories/{id} ──────────────────────────────────────────────────────────

export interface Category {
  name: string;
  icon: string;
  order: number;
  businessCount: number;
}

export type CategoryDoc = Category & { id: string };

// ── subscriptions/{id} ───────────────────────────────────────────────────────

/**
 * Base monetary unit (in CRC) for a subscription. The amount a business commits is an
 * integer multiple of this unit (`units`); that integer feeds the support magnitude in
 * the ranking score. ~₡5.000 ≈ US$10. The platform NEVER processes this money — the
 * business pays the school directly via SINPE; this entity only records the relationship.
 */
export const SUBSCRIPTION_UNIT_CRC = 5000;

/**
 * How many days a single confirmation stays valid before it must be renewed. A
 * subscription is recurring but the platform never sees renewals, so confirmation is
 * time-boxed: after this window the support stops counting unless re-confirmed.
 */
export const SUBSCRIPTION_CONFIRMATION_DAYS = 90;

/**
 * Window before `expiresAt` during which a confirmed subscription is considered
 * `expiring` (a renewal nudge). It still counts toward the ranking.
 */
export const SUBSCRIPTION_EXPIRING_WINDOW_DAYS = 14;

/**
 * Subscription lifecycle. A subscription is recurring but the platform never sees the
 * money, so confirmation is time-boxed and decays if not renewed (see `expiresAt`):
 * - `pending`: business committed/uploaded a proof; the school has not confirmed yet.
 *   Does NOT count toward the ranking.
 * - `confirmed`: the school confirmed the SINPE proof matches. Counts toward the ranking
 *   until `expiresAt`.
 * - `expiring`: confirmed but close to `expiresAt` (renewal nudge); still counts.
 * - `expired`: `expiresAt` passed without renewal. No longer counts.
 * Only the target school's owner/editors or admin may move a subscription into
 * `confirmed` (the business can never self-confirm; see firestore.rules).
 */
export type SubscriptionStatus =
  | "pending"
  | "confirmed"
  | "expiring"
  | "expired";

/**
 * First-class support relationship: a business subscribes to (supports) a school via a
 * recurring SINPE payment. Summing a business's `confirmed` subscriptions reconstructs
 * the ranking signals C (community institutions) and I (institutions in general); the
 * `status`/`expiresAt` pair drives time decay. The day the platform decides to mediate
 * payments, the money flow can be layered on top of this same schema.
 */
export interface Subscription {
  businessId: string;
  /** Denormalized so the school's confirmation UI renders without extra reads. */
  businessName: string;
  schoolId: string;
  /** Denormalized so a business's support list renders without extra reads. */
  schoolName: string;
  /** Integer n in `n × SUBSCRIPTION_UNIT_CRC`. Feeds the support magnitude. */
  units: number;
  /** Denormalized convenience: `units * SUBSCRIPTION_UNIT_CRC` (CRC). */
  amount: number;
  status: SubscriptionStatus;
  /** Set by the school/admin when the proof is confirmed; null while pending. */
  confirmedAt: Timestamp | null;
  /** When the confirmation lapses if not renewed; null while pending. */
  expiresAt: Timestamp | null;
  /** uid of the school owner/editor or admin who confirmed. */
  confirmedBy?: string;
  /**
   * Whether a SINPE proof file has been uploaded. The file itself is sensitive (it shows
   * amounts, names, phone numbers) so it lives in Firebase Storage at the private path
   * `subscription-proofs/{id}/proof`, gated by storage.rules — NEVER in this public doc.
   * This flag is the only public signal; the school fetches the file via the Storage SDK
   * at confirm time (see getSubscriptionProofUrl).
   */
  proofUploaded?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SubscriptionDoc = Subscription & { id: string };

// ── businesses/{id}/reviews/{userId} ─────────────────────────────────────────

/**
 * A review of a business. Stored in the subcollection `businesses/{id}/reviews/{userId}`
 * with the doc id = author uid, which enforces one review per user per business at the
 * storage level (no query needed). Reading is public; writing requires Google sign-in and
 * the author cannot be the business owner/editor (see firestore.rules). Aggregated into the
 * business's `reviewStats` by a Cloud Function.
 */
export interface Review {
  /** Author uid (also the document id). */
  authorId: string;
  /** Denormalized display name for rendering without a users read. */
  authorName: string;
  /** Integer 1–5. */
  rating: number;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ReviewDoc = Review & { id: string };

// ── Buyer state (NOT Firestore) ──────────────────────────────────────────────

/**
 * The "buyer" (person) has NO account or Firestore document.
 * Their chosen school and location live ONLY in localStorage. This type documents
 * the shape of that client-side data.
 */
export interface BuyerPreferences {
  schoolId?: string;
  schoolName?: string;
  location?: { lat: number; lng: number };
}
