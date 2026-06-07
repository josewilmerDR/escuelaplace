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

export interface Subscription {
  active: boolean;
  plan: string;
  /** Date until which the subscription is valid. */
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
  subscription: Subscription;
  ranking: BusinessRanking;
  metrics: BusinessMetrics;
  ownerId: string; // uid of the owner user who administers this business page
  /** uids of co-administrators allowed to edit the page (optional). */
  editorIds?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Business with its document id included (what the data layer returns). */
export type BusinessDoc = Business & { id: string };

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
