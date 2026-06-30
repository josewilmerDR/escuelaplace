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
 * - Sensitive data (the school's payment methods) does NOT live in the public doc: it goes in the
 *   private subcollection `schools/{id}/private/data` (see `SchoolPrivate`).
 */
import type { GeoPoint, Timestamp } from "firebase/firestore";

// ── Shared types ─────────────────────────────────────────────────────────────

/**
 * Where a page physically is. The pin (geopoint + geohash) is the source of truth for
 * proximity; the admin* fields are the country-agnostic administrative hierarchy
 * (Google geocoder levels), general → specific:
 * - admin1: province / state / department (CR: provincia, MX: estado, NI: departamento)
 * - admin2: canton / municipality
 * - admin3: district / community / colonia
 * All free text suggested by reverse geocoding, editable by the owner, and optional
 * ("" when unknown or not applicable — display helpers in lib/location filter empties).
 */
export interface Location {
  geopoint: GeoPoint;
  geohash: string;
  address?: string;
  /** ISO 3166-1 alpha-2 code (e.g. "CR"), when the geocoder provided it. */
  country?: string;
  admin1: string;
  admin2: string;
  admin3: string;
}

export interface BusinessContact {
  whatsapp?: string;
  /**
   * WhatsApp Business catalog: the wa.me/c/… share link, or the number that hosts the
   * catalog. The platform never hosts products — it links to the catalog the owner
   * already maintains in WhatsApp (see buildCatalogUrl in lib/contact).
   */
  catalog?: string;
  phone?: string;
  // NOTE: the owner's contact `email` is NOT here. It is rendered on no public surface, so
  // keeping it in this world-readable map made it a harvestable email in every catalog scrape
  // (#13). It now lives in the private subcollection (see BusinessPrivate). Legacy docs may
  // still carry a stale `contact.email` at runtime; the edit form migrates it to private on
  // the next save (and the public write replaces the whole map, scrubbing it).
  web?: string;
  instagram?: string;
  facebook?: string;
}

/**
 * Private subcollection: businesses/{id}/private/data
 * Owner-only contact details kept OFF the world-readable business doc. Currently just the
 * contact email: captured for the owner but shown on no public page, so it would otherwise
 * be a harvestable email in every scrape of the catalog (finding #13). Readable/writable by
 * the business owner/editors and admin only (see firestore.rules) — never public, unlike the
 * business doc itself.
 */
export interface BusinessPrivate {
  /** Owner's contact email, relocated here from the public `contact` map. */
  email?: string;
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

/** Contact channels tracked on the public business profile. */
export type ContactChannel =
  | "whatsapp"
  | "catalog"
  | "phone"
  | "directions"
  | "website"
  | "instagram"
  | "facebook";

/** Events the public profile reports: a profile view or a contact-channel click. */
export type BusinessEvent = "view" | ContactChannel;

export interface BusinessMetrics {
  views: number;
  /** Sum of all contact-channel clicks (kept in sync by the trackInteraction function). */
  interactions: number;
  /**
   * Lifetime per-channel click counters. Keys are created on first increment, so docs
   * predating a channel simply lack its key (missing = zero).
   */
  clicks?: Partial<Record<ContactChannel, number>>;
  /**
   * Walk-in customers who mentioned escuelaplace at the counter, recorded by the
   * business itself via the recordWalkIn callable (manager-only). Private bookkeeping
   * for the owner's ROI report — never part of the ranking.
   */
  walkIns?: number;
}

/**
 * businesses/{id}/metricsDaily/{day} — per-day counters, doc id = YYYY-MM-DD in Costa
 * Rica time. Written ONLY by the trackInteraction Cloud Function (Admin SDK); read by
 * the owner's panel. Lifetime totals live in the business doc's `metrics`; this series
 * exists because "this month vs last month" can't be answered from lifetime counters.
 */
export interface BusinessDailyMetrics {
  views?: number;
  clicks?: Partial<Record<ContactChannel, number>>;
  /** Walk-ins recorded by the business that day (see BusinessMetrics.walkIns). */
  walkIns?: number;
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
 * - `pending`: just created, never verified. Payment methods hidden, "unverified" banner shown.
 * - `verified`: admin approved. Payment methods visible to supporters.
 * - `needs_reverification`: owner edited a sensitive field (name or payment methods) after being
 *   verified. They are hidden again and the banner reappears until admin re-approves.
 * Only admin may write this field (the owner cannot self-verify; see firestore.rules).
 */
export type SchoolVerificationStatus =
  | "pending"
  | "verified"
  | "needs_reverification";

// ── businesses/{id} ──────────────────────────────────────────────────────────

/**
 * UI cap for page descriptions (business/school). Keeps cards and profiles readable;
 * enforced by the form inputs (maxLength), not by rules.
 */
export const PAGE_DESCRIPTION_MAX = 300;

/** Gallery photo cap per business. Enforced by the panel UI, not by rules. */
export const BUSINESS_GALLERY_MAX = 5;

/**
 * Search tags ("keywords") cap per business, and the max length of each. Tags are the
 * owner's free-text search keywords (Amazon-style: products/phrases people type, e.g.
 * "cuadernos", "útiles escolares"), matched by the in-memory search relevance. Enforced
 * by the panel UI and the `normalizeTags` helper, not by rules.
 */
export const BUSINESS_TAGS_MAX = 15;
export const BUSINESS_TAG_MAX = 50;

export interface Business {
  name: string;
  slug: string;
  description: string;
  categories: string[]; // category ids
  categoryNames: string[]; // denormalized for rendering without extra reads
  location: Location;
  /** Linked school, or "" — linking is optional (the owner may add it later). */
  schoolId: string;
  schoolName: string; // denormalized; "" when no school is linked
  contact: BusinessContact;
  discount: Discount;
  logoUrl?: string;
  /** Header cover of the public profile (falls back to logo, then initial). */
  coverUrl?: string;
  /**
   * Gallery photos (max BUSINESS_GALLERY_MAX), shown in the public "Fotos" section —
   * merchants use it as a visual catalog or as ambience shots. Legacy docs created
   * before `coverUrl` existed carry the cover as photos[0] instead; readers resolve
   * with `coverUrl ?? photos[0]` and treat the rest as the gallery.
   */
  photos: string[];
  /**
   * Owner-curated search keywords (max BUSINESS_TAGS_MAX, each ≤ BUSINESS_TAG_MAX chars):
   * products or phrases buyers type — "cuadernos", "útiles escolares" — that the search
   * relevance matches alongside name/category/description. Absent on legacy docs (read
   * with `?? []`). Editorial free text, written by the client like `description`; it feeds
   * search match only, never the ranking score. */
  tags?: string[];
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
  /** "" when the business has no linked school (see Business.schoolId). */
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
  /**
   * Distinct supporters with currently-counting support, of any kind: business pages +
   * personal donors. Function-maintained (see recomputeSchool); absent on legacy docs.
   * A count, never an amount — the platform does not publish money figures.
   */
  uniqueSupporters?: number;
}

export interface School {
  name: string;
  description: string;
  thankYouMessage: string;
  location: Omit<Location, "address">;
  /** Round profile photo of the public page (the "avatar" slot). */
  photoUrl?: string;
  /** Header cover of the public profile (falls back to photos[0], then photoUrl). */
  coverUrl?: string;
  /** Gallery photos (max BUSINESS_GALLERY_MAX, same cap as businesses), shown in the
   * public "Fotos" section — the school's life: activities, infrastructure, projects. */
  photos?: string[];
  boardContact: BoardContact;
  status: SchoolStatus;
  verified: boolean;
  /**
   * Verification lifecycle (see SchoolVerificationStatus). Drives whether the payment methods are
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
 * Plain, JSON-serializable subset of a school for rendering cards (the public /schools
 * directory and the donation picker). Server components map `SchoolDoc` to this (dropping
 * the non-serializable Timestamp/GeoPoint values) before handing it to client components,
 * which re-order it by proximity. `lat`/`lng` are the pin coordinates the client re-rank
 * needs (null when the school has no geopoint); `supportingBusinesses`/`uniqueSupporters`
 * feed the activity signal and the supporters chip. Mirrors `BusinessCardData`.
 */
export interface SchoolCardData {
  id: string;
  name: string;
  /** "locality, region" precomputed (localityLabel); "" when unknown. */
  locality: string;
  /** Round avatar photo. */
  photoUrl?: string;
  /** Card cover thumbnail: coverUrl ?? photos[0] ?? photoUrl. */
  photo?: string;
  verified: boolean;
  supportingBusinesses: number;
  uniqueSupporters: number;
  /** Whether the school has at least one project currently `active` (crowdfunding now).
   * Decorative directory signal; defaults to false where not computed (e.g. pickers). */
  hasActiveProject: boolean;
  /** Pin coordinates for the proximity re-rank; null when the school has no geopoint. */
  lat: number | null;
  lng: number | null;
}

/**
 * One way to send money directly to the school, as free-form label:value — e.g.
 * "Cuenta bancaria: CR05…", "SINPE Móvil: 8888-1234", "PayPal: junta@escuela.org".
 * Purely INFORMATIONAL for the supporter: the platform never processes nor certifies
 * payments, it only relays what the school published. Free text on both sides so any
 * country's local rails (Modo, Bizum, Pix, IBAN…) fit without code changes.
 */
export interface PaymentMethod {
  label: string;
  value: string;
  /**
   * Read-time DISPLAY hint, never stored: the bare datum to put on the clipboard when
   * `value` is shown with extra human context (e.g. a legacy SINPE renders as
   * "88881234 (Junta…)" but only "88881234" should be copied). Absent ⇒ copy `value`
   * verbatim. Set by displayPaymentMethodsOf; the stored shape (paymentMethodsOf) omits it.
   */
  copyValue?: string;
}

/**
 * Private subcollection: schools/{id}/private/data
 * Sensitive payment data, hidden until the school is verified (see firestore.rules and
 * getVerifiedSchoolPaymentMethods). NEVER included in the public school document.
 */
export interface SchoolPrivate {
  /** Ordered list shown to supporters once the school is verified. */
  paymentMethods?: PaymentMethod[];
  /** Legacy single SINPE (docs predating paymentMethods). Readers normalize it into
   * the list via paymentMethodsOf — do not render it directly. */
  sinpe?: {
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
 * business pays the school directly through its published payment methods; this entity only records the relationship.
 */
export const SUBSCRIPTION_UNIT_CRC = 5000;

/**
 * Upper bound for `units` in a single subscription/donation. Anti-typo guard (mirrors how
 * PROJECT_STAGE_COST_MAX caps stage cost): one extra zero shouldn't register an absurd
 * amount the school then has to reject. The platform never moves money, so this only bounds
 * the recorded relationship, not a payment.
 */
export const SUBSCRIPTION_UNITS_MAX = 1000;

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
 * Days a `pending` support can wait before the UI flags it as stale (waiting too long for
 * the school to confirm). Drives the amber emphasis on the aging chip and lets a supporter
 * know it's reasonable to nudge — never a platform judgment about the money, only elapsed
 * time. See PendingAge / the dispute-handling nudge (capa 1).
 */
export const SUBSCRIPTION_STALE_PENDING_DAYS = 7;

/**
 * Subscription lifecycle. A subscription is recurring but the platform never sees the
 * money, so confirmation is time-boxed and decays if not renewed (see `expiresAt`):
 * - `pending`: the supporter committed/uploaded a proof; the school has not confirmed
 *   yet. Does NOT count toward the ranking.
 * - `confirmed`: the school confirmed the payment proof matches. Counts toward the ranking
 *   until `expiresAt`.
 * - `expiring`: confirmed but close to `expiresAt` (renewal nudge); still counts.
 * - `expired`: `expiresAt` passed without renewal. No longer counts.
 * Only the target school's owner/editors or admin may move a subscription into
 * `confirmed` (the supporter can never self-confirm; see firestore.rules).
 */
export type SubscriptionStatus =
  | "pending"
  | "confirmed"
  | "expiring"
  | "expired";

/**
 * Who supports a school through a subscription: a business page, or a signed-in user
 * donating personally (no page, no commercial intent). Legacy docs predate this field —
 * absent means 'business'.
 */
export type SupporterType = "business" | "user";

/**
 * First-class support relationship: a supporter (business page or personal donor)
 * supports a school via a direct payment. Summing a business's `confirmed` subscriptions
 * reconstructs the ranking signals C (community institutions) and I (institutions in
 * general); the `status`/`expiresAt` pair drives time decay. Personal donations follow
 * the exact same lifecycle (the school confirms the proof, the confirmation is
 * time-boxed) but feed the donor's recognition tier instead of a ranking. The day the
 * platform decides to mediate payments, the money flow can be layered on top of this
 * same schema.
 */
export interface Subscription {
  /** Supporter discriminator. Absent on legacy docs → treat as 'business'. */
  supporterType?: SupporterType;
  /** Supporting business page. Present iff the supporter is a business. */
  businessId?: string;
  /** Denormalized so the school's confirmation UI renders without extra reads. */
  businessName?: string;
  /** Donating user (uid). Present iff the supporter is a person (`supporterType: 'user'`). */
  donorId?: string;
  /**
   * Denormalized account name so the school's confirmation UI can match the proof
   * without a users read. Public surfaces must NOT render it — recognition is opt-in
   * through `donorProfiles/{uid}` (see DonorProfile).
   */
  donorName?: string;
  schoolId: string;
  /** Denormalized so a business's support list renders without extra reads. */
  schoolName: string;
  /** Integer n in `n × SUBSCRIPTION_UNIT_CRC`. Feeds the support magnitude. */
  units: number;
  /** Denormalized convenience: `units * SUBSCRIPTION_UNIT_CRC` (CRC). */
  amount: number;
  status: SubscriptionStatus;
  /** Set by the school/admin when the proof is confirmed; null while pending. Moves
   * forward on every renewal — for response-time math use `firstConfirmedAt`. */
  confirmedAt: Timestamp | null;
  /**
   * First time the school ever confirmed this subscription. Set once (renewals move
   * `confirmedAt` but never this), so `firstConfirmedAt - createdAt` is the school's
   * real response time — the basis of the public "normalmente confirma en ~X" chip.
   * Only the school/admin may write it (see firestore.rules: a supporter faking it
   * would fake the school's responsiveness). Absent on legacy docs → readers fall
   * back to `confirmedAt`.
   */
  firstConfirmedAt?: Timestamp | null;
  /** When the confirmation lapses if not renewed; null while pending. */
  expiresAt: Timestamp | null;
  /** uid of the school owner/editor or admin who confirmed. */
  confirmedBy?: string;
  /**
   * (fn) Anti-fraud ranking eligibility, maintained by the Cloud Function (clients can
   * never write it — see firestore.rules). False when this support must NOT feed business
   * ranking: the target school isn't `verified`, or it's self-dealing (the supporting
   * business and the confirming school share an administrator). Absent = not yet evaluated
   * → readers treat it as eligible until the next recompute backfills it. The server score
   * recomputes eligibility live; this flag lets the client feed re-rank apply the same gate
   * without reading school docs. Only meaningful for business-backed support.
   */
  countsForRanking?: boolean;
  /**
   * Whether a payment proof file has been uploaded. The file itself is sensitive (it shows
   * amounts, names, phone numbers) so it lives in Firebase Storage at the private path
   * `subscription-proofs/{id}/proof`, gated by storage.rules — NEVER in this public doc.
   * This flag is the only public signal; the school fetches the file via the Storage SDK
   * at confirm time (see getSubscriptionProofUrl).
   */
  proofUploaded?: boolean;
  /**
   * Optional PADRINO context: a recurring personal donation (`supporterType: 'user'`) that backs a
   * specific pageant candidate. Both set together at create, then FROZEN (part of the supporter
   * identity — see firestore.rules keepsSupporterIdentity). PUBLIC (which candidate, not the
   * magnitude — that stays in private/data), so a Cloud Function can recompute the candidate's
   * `padrinoCount` without a private read, exactly like pageantVotes' candidateId. Absent on a plain
   * school donation. The donor's tier/recognition still flows through `donorProfiles` unchanged.
   */
  pageantToolId?: string;
  candidateId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SubscriptionDoc = Subscription & { id: string };

// ── auditEvents/{id} ──────────────────────────────────────────────────────────
/**
 * Append-only, non-sensitive audit trail written ONLY by the Cloud Function on each
 * confirmation (see firestore.rules: admin-only read, no client write). It records WHO
 * confirmed WHAT WHEN plus the deterministic collusion signals — never the payment proof
 * or any money figure. Two jobs: an admin's fraud pattern-review trail, and the feature
 * store for the planned risk-scoring layer, which needs this event stream to catch the
 * two-identity collusion the deterministic ranking gate can't, without touching sensitive
 * data. Keep it cheap: store COUNTS and booleans, never amounts or proof.
 */
export interface AuditEvent {
  /** Which confirmation this records (extensible). */
  type:
    | "subscription_confirmed"
    | "project_contribution_confirmed"
    | "pageant_vote_confirmed";
  /** Source doc id of a subscription confirmation. */
  subscriptionId?: string;
  /** Source doc id of a project-contribution confirmation. */
  contributionId?: string;
  /** Source doc id of a pageant-support confirmation (pageant_vote_confirmed only). */
  voteId?: string;
  /** Project funded (project_contribution_confirmed only). */
  projectId?: string;
  /** Denormalized project title (project_contribution_confirmed only). */
  projectTitle?: string;
  /** Money vs in-kind (project_contribution_confirmed only). */
  contributionType?: ProjectContributionType;
  /** Reinado tool the support backed (pageant_vote_confirmed only). */
  toolId?: string;
  /** Candidate backed + denormalized name (pageant_vote_confirmed only). */
  candidateId?: string;
  candidateName?: string;
  supporterType: SupporterType;
  /** Present iff a business support confirmation. */
  businessId?: string;
  /** Present iff a personal-donation / project-contribution confirmation. */
  donorId?: string;
  schoolId: string;
  /** Denormalized so the admin review UI renders without N+1 reads. */
  schoolName: string;
  /** Business page name or donor account name. Fine here — `auditEvents` is an admin-only
   * surface (unlike public surfaces, which must not render a donor name). */
  supporterName: string;
  /** Support magnitude — a COUNT, never a money figure (subscriptions: n × SUBSCRIPTION_UNIT_CRC;
   * pageant votes: support units). Absent on project contributions (no units). */
  units?: number;
  /** uid that confirmed (the school side); null on legacy/unknown. */
  confirmedBy: string | null;
  confirmedAt: Timestamp | null;
  /** Whether the target school was `verified` at confirm time. */
  schoolVerified: boolean;
  /** The supporter side shares an administrator with the confirming school. */
  selfDealt: boolean;
  /** The very uid that confirmed also controls the supporter side — the sharpest
   * same-identity self-confirmation signal. */
  confirmerIsSupporter: boolean;
  createdAt: Timestamp;
}

export type AuditEventDoc = AuditEvent & { id: string };

/**
 * `deletionEvents/{id}` **(fn, append-only, admin-only read)** — the compliance + fraud trail of
 * every privileged erasure (Ley 8968 cancelation right). Written ONLY by the deletion callables
 * (Admin SDK); the client can never read or write it. Records WHO erased WHAT and WHEN plus COUNTS
 * of what cascaded — never a name, amount, or payment proof.
 */
export interface DeletionEvent {
  type: "page_deleted" | "account_deleted";
  /** uid that triggered the erasure (the owner, the account itself, or an admin). */
  actorUid: string;
  /** page_deleted: the page removed. */
  pageType?: PageType;
  pageId?: string;
  pageName?: string;
  /** page_deleted: an admin deleted someone else's page (moderation), not the owner. */
  byAdmin?: boolean;
  /** account_deleted: how the caller's pages were resolved + how many personal records cascaded. */
  pagesDeleted?: number;
  pagesTransferred?: number;
  editorResigned?: number;
  subscriptions?: number;
  projectContributions?: number;
  pageantVotes?: number;
  orders?: number;
  reviews?: number;
  createdAt: Timestamp;
}

export type DeletionEventDoc = DeletionEvent & { id: string };

// ── donorProfiles/{uid} ──────────────────────────────────────────────────────

/**
 * Recognition tier for personal donors, derived from accumulated CONFIRMED units across
 * all schools. Thresholds and the mapping live in `lib/firestore/donors.ts`
 * (DONOR_TIER_MIN_UNITS / donorTierForUnits). Tiers deliberately blur the exact amount:
 * public surfaces render the tier, never units or colones.
 */
export type DonorTier = "bronze" | "silver" | "gold" | "platinum";

/**
 * Public recognition surface for a personal donor (doc id = the user's uid). Kept apart
 * from `users/{uid}` because that doc is private (self/admin reads only) while this one
 * backs the school's public "thank-you wall" (SSR, anonymous readers).
 *
 * The donor creates it and controls ONLY the recognition preferences (`displayName`,
 * `isPublic`). The totals and the tier are derived from confirmed donations and
 * maintained by a Cloud Function — clients can never write them (see firestore.rules),
 * so nobody can self-assign a tier.
 *
 * Reads are gated by `isPublic`: others can read the doc only when the donor opted in;
 * a donor who opted out still counts in aggregate metrics but renders as anonymous.
 */
export interface DonorProfile {
  /** Name shown on public recognition surfaces (defaults to the account name). */
  displayName: string;
  /** Opt-in to public recognition. False → counted in aggregates, rendered anonymous. */
  isPublic: boolean;
  /** Accumulated confirmed units across all schools (function-maintained). */
  totalUnits: number;
  /** Tier derived from `totalUnits` (function-maintained); null until first confirmation. */
  tier: DonorTier | null;
  /** Distinct schools with at least one confirmed donation (function-maintained). */
  schoolsSupported: number;
  /**
   * Distinct school projects this donor has contributed to with at least one CONFIRMED
   * contribution, across all schools (function-maintained). Backs the "participó en N
   * proyectos" badge. Absent on profiles predating the projects feature → treat as 0.
   */
  projectsSupported?: number;
  /** First confirmation ever — the donor's seniority ("donante desde…"). */
  firstConfirmedAt: Timestamp | null;
  /** Most recent confirmation (function-maintained). */
  lastConfirmedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DonorProfileDoc = DonorProfile & { id: string };

/** Max length of a donor's public display name (recognition form). */
export const DISPLAY_NAME_MAX = 60;

// ── thankYous/{id} + schools/{schoolId}/config/thanks ─────────────────────────

/**
 * Max length of a thank-you message / template (chars). Same budget as a page description;
 * enforced by the panel inputs, not by rules.
 */
export const THANK_YOU_MESSAGE_MAX = 600;

/**
 * The token a school may drop into a template; substituted with the supporter's name before
 * delivery (see renderThankYou). Country-agnostic — a school writing in any language uses the
 * same literal token.
 */
export const THANK_YOU_NAME_TOKEN = "{nombre}";

/**
 * Anniversary years that, by default, prompt the school to craft a PERSONAL gesture (a
 * letter, a placard, a short video) instead of auto-sending a template. A school may override
 * the list in its config. Year 0 is never an anniversary — that's the `welcome`.
 */
export const THANK_YOU_SPECIAL_YEARS_DEFAULT: number[] = [1, 5];

/** Cap on how many special anniversary years a school may list (anti-typo / sanity bound). */
export const THANK_YOU_SPECIAL_YEARS_MAX = 12;

/**
 * The relationship moment a thank-you marks:
 * - `welcome`: the supporter's FIRST confirmed support to this school.
 * - `renewal`: a later confirmation (the recurring "one more period with us").
 * - `anniversary`: an N-year mark since the first confirmation (`years` is set).
 */
export type ThankYouMilestoneKind = "welcome" | "renewal" | "anniversary";

/**
 * Optional rich media attached to a thank-you (a short clip of the kids waving, a photo). The
 * files live in Storage under `schools/{id}/thanks/...`; this holds only their public URLs.
 */
export interface ThankYouMedia {
  /** Public Storage URL of a single image. */
  photoUrl?: string;
  /** Public Storage URL of a single short video (≤ TOOL_VIDEO_MAX_SECONDS). */
  videoUrl?: string;
}

/**
 * A reusable thank-you the school writes ONCE and the platform auto-sends when the matching
 * milestone fires. `message` is free text that may embed THANK_YOU_NAME_TOKEN; `media` is
 * optional. An absent/blank template means "don't auto-send for this milestone" — special
 * milestones then prompt the school instead (see ThankYouConfig / planThankYou).
 */
export interface ThankYouTemplate {
  message: string;
  media?: ThankYouMedia;
}

/**
 * schools/{schoolId}/config/thanks — the school's thank-you setup. PUBLIC read (it is shown to
 * supporters), owner/editors or admin write. Not sensitive, so unlike `private/data` it is
 * world-readable; it is kept OFF the hot school doc so the catalog read stays lean.
 *
 * The example copy the product shows schools is INSPIRATION rendered in the editor, never a
 * stored default: every template here is the school's own words. The whole point is to nudge
 * schools toward a simple, cheap, memorable gesture that builds community.
 */
export interface ThankYouConfig {
  /** Auto-sent on the supporter's first confirmed support; absent → the school is prompted. */
  welcome?: ThankYouTemplate;
  /** Auto-sent on each later confirmation; absent → nothing is sent on renewals. */
  renewal?: ThankYouTemplate;
  /** Auto-sent on a NON-special anniversary year; absent → nothing is sent. */
  anniversaryGeneric?: ThankYouTemplate;
  /** Anniversary years that prompt a PERSONAL gesture instead of a template (defaults to
   * THANK_YOU_SPECIAL_YEARS_DEFAULT when absent). */
  specialYears?: number[];
  updatedAt: Timestamp;
}

export type ThankYouConfigDoc = ThankYouConfig & { id: string };

/**
 * A thank-you delivered to (or pending the school's personal touch for) one supporter at one
 * milestone. Written ONLY by the milestone-detector Cloud Function — clients never create it
 * (see firestore.rules); the school personalizes a `prompted` one and records its real-world
 * gesture, and the recipient marks it seen. Top-level (like subscriptions) so the recipient
 * reads theirs across schools and the school reads its own queue.
 *
 * The recipient is a person (`donorId`) OR a business page (`businessId`) — the platform thanks
 * "cada persona o comercio". `supporterName` is denormalized for both surfaces. No money figure
 * is ever stored here (gratitude, not a ledger).
 */
export interface ThankYou {
  supporterType: SupporterType;
  /** Recipient person (uid). Present iff supporterType 'user'. */
  donorId?: string;
  /** Recipient business page. Present iff supporterType 'business'. */
  businessId?: string;
  /** Display name of the supporter (person account name or business name). */
  supporterName: string;
  schoolId: string;
  schoolName: string;
  milestone: ThankYouMilestoneKind;
  /** Completed years with the school (anniversary only). */
  years?: number;
  /**
   * True when the product treats this milestone as worth a special gesture (a `welcome`, or
   * an anniversary in the school's specialYears). Independent of `status`: an auto-sent welcome
   * is still special. Drives the school's "gestos por hacer" queue together with `status`.
   */
  special: boolean;
  /**
   * - `sent`: a message is ready for the supporter to see (an auto-template, or one the school
   *   wrote). - `prompted`: waiting for the school to craft its personal thank-you.
   */
  status: "sent" | "prompted";
  /** The delivered message (already rendered with the supporter's name). "" while `prompted`. */
  message: string;
  /** Optional media shown with the message. */
  media?: ThankYouMedia;
  /** The school's note about the real-world gesture (placard placed, letter sent). */
  gestureNote?: string;
  /** Whether the school marked the physical gesture done. */
  gestureDone?: boolean;
  /** Whether the recipient has seen it (so the celebratory card shows once). */
  seenByDonor?: boolean;
  /** When a `prompted` thank-you was sent by the school (null for an auto-sent one). */
  deliveredAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ThankYouDoc = ThankYou & { id: string };

// ── schools/{schoolId}/projects/{projectId} ─────────────────────────────────

/** UI caps for the project crowdfunding form. Enforced by the panel inputs, not rules. */
export const PROJECT_TITLE_MAX = 120;
export const PROJECT_DESCRIPTION_MAX = 600;
/** Stages per project, and media per stage. */
export const PROJECT_STAGE_MAX = 12;
export const PROJECT_STAGE_TITLE_MAX = 120;
export const PROJECT_STAGE_JUSTIFICATION_MAX = 500;
// Defensive cap: stops one extra zero from inflating the goal and the progress bar.
export const PROJECT_STAGE_COST_MAX = 100_000_000;
export const PROJECT_STAGE_PHOTO_MAX = 5;
export const PROJECT_STAGE_QUOTE_MAX = 3;
// A stage's optional short video reuses the tool-wide short-video budget
// (TOOL_VIDEO_MAX_SECONDS / TOOL_VIDEO_MAX_MB, declared with the tools below).
/** UI cap for a contribution's in-kind description ("¿qué donas?"). */
export const CONTRIBUTION_DESCRIPTION_MAX = 500;

/**
 * Currencies a project goal can be denominated in. The platform is country-agnostic, so
 * the cost of a project is NOT assumed to be colones — the school picks the currency and
 * every amount (stage costs, raised, contributions) is read in it. The platform never
 * processes the money; this only labels the figures the school itself publishes.
 */
export type ProjectCurrency = "CRC" | "USD" | "NIO" | "MXN" | "EUR";
export const PROJECT_CURRENCIES: ProjectCurrency[] = [
  "CRC",
  "USD",
  "NIO",
  "MXN",
  "EUR",
];

/**
 * Project lifecycle. Unlike support subscriptions there is NO time decay — a project runs
 * until the school closes it:
 * - `active`: open for contributions.
 * - `completed`: the school closed it (goal funded AND delivered, or an in-kind donation
 *   fulfilled it). Reaching the money goal alone does NOT auto-complete it — buying the
 *   tank still has to happen — so completion is always a manual board action.
 * - `cancelled`: the school abandoned it.
 * "Goal reached" (raised ≥ goal) is derived in the UI from the figures, not a stored status.
 */
export type ProjectStatus = "active" | "completed" | "cancelled";

/**
 * One funded step of a project, embedded in the project doc. Each stage justifies its own
 * cost and may attach photos (e.g. the terrain today + a projection of the result), a short
 * video, and quotes (cotizaciones) for transparency — the same evidence the verification
 * mechanic already rewards. The project goal is the SUM of the stage costs (computed, never
 * stored). Media mirrors a guided-tour stage: up to PROJECT_STAGE_PHOTO_MAX photos plus one
 * clip ≤ TOOL_VIDEO_MAX_SECONDS.
 */
export interface ProjectStage {
  title: string;
  /** Why this stage exists and why it costs what it costs. */
  justification: string;
  /** Cost in the project's `currency`. */
  cost: number;
  /** Public Storage URLs (schools/{id}/projects/{pid}/...). */
  photos?: string[];
  /** Public Storage URL of a single short video (≤ TOOL_VIDEO_MAX_SECONDS). */
  videoUrl?: string;
  /** Public Storage URLs of quotes/receipts (images or PDFs). */
  quoteUrls?: string[];
}

/**
 * A concrete fundraising project a school lists (e.g. "Comprar tanque de agua potable").
 * Lives in the subcollection `schools/{schoolId}/projects/{projectId}` (public read).
 *
 * Like the payment methods, contributing is gated by verification: anyone managing the
 * school may DRAFT projects, but the public "Financiar" button only appears once the
 * school is `verified` (see the contribution create rule) — the same gate that protects
 * the SINPE data, so no human content moderation is needed.
 *
 * `raised` and `contributorsCount` are derived from CONFIRMED contributions and maintained
 * by a Cloud Function (Admin SDK) — clients can never write them (see firestore.rules), so
 * the progress bar can't be faked.
 */
export interface Project {
  /** Denormalized parent id (the doc already lives under the school, kept for the
   * contribution flow and queries that start from a project). */
  schoolId: string;
  /** Denormalized so the contribution UI renders without an extra read. */
  schoolName: string;
  title: string;
  description: string;
  currency: ProjectCurrency;
  status: ProjectStatus;
  /** Ordered stages; the goal is the sum of their costs. */
  stages: ProjectStage[];
  /** Header image of the project card/detail. */
  coverUrl?: string;
  /** Sum of CONFIRMED money contributions, in `currency` (function-maintained). */
  raised: number;
  /** Distinct donors with at least one confirmed contribution (function-maintained). */
  contributorsCount: number;
  /** Denormalized from the school so rules/UI can resolve the board without an extra read. */
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ProjectDoc = Project & { id: string };

// ── schools/{schoolId}/tools/{toolId} ───────────────────────────────────────

/**
 * "Herramientas": lightweight activities a school runs that don't warrant their own tab —
 * a raffle, a bingo, a sale, a service, a guided tour, etc. Each is a card the school
 * publishes on its public "Principal" tab (plus a detail page). PURELY INFORMATIONAL: like
 * every other surface the platform never processes money — a tool may carry an optional
 * WhatsApp contact (an alternate number + custom button label), nothing more.
 *
 * The concrete kinds live in a registry (lib/tools/registry) keyed by `type`; adding a kind
 * is editing that registry (+ this union and the rules list), not the storage shape — the
 * create/edit/render flow is identical for every kind. Lives in
 * `schools/{schoolId}/tools/{toolId}` (public read). No function-maintained fields: the
 * school owns every field.
 */

/**
 * Kinds of tool. The keys are the stored discriminator; the Spanish labels and icons live in
 * the registry (lib/tools/registry). Open-ended and country-agnostic — extend here, in
 * TOOL_TYPES, in the registry, and in the firestore.rules allow-list together.
 */
export type ToolType =
  | "raffle"
  | "bingo"
  | "sale"
  | "service"
  | "guided_tour"
  | "event"
  | "pageant"
  | "other";

/** Stored discriminator values, mirrored in firestore.rules (which can't import TS). */
export const TOOL_TYPES: ToolType[] = [
  "raffle",
  "bingo",
  "sale",
  "service",
  "guided_tour",
  "event",
  "pageant",
  "other",
];

/**
 * A tool's visibility: `active` shows on the public page, `inactive` hides it (a draft, or a
 * finished activity the school keeps around to re-activate later).
 */
export type ToolStatus = "active" | "inactive";

/** UI caps for the tool form. Enforced by the panel inputs and the rules. */
export const TOOL_TITLE_MAX = 120;
export const TOOL_DESCRIPTION_MAX = 600;
/** Cap for the "Consultar" button's custom label. */
export const TOOL_CONTACT_LABEL_MAX = 40;

// ── Raffle (type: 'raffle') — the first kind with its own configured behavior ──
//
// A raffle ("rifa") sells numbered tickets (00–99) toward a draw. Its config lives on the
// tool doc under `raffle`; the sold/reserved state of each number is DERIVED from its orders
// (raffleOrders), never stored on the tool. PURELY INFORMATIONAL like everything else — the
// platform never processes money; a buyer reserves numbers and pays the school directly, and
// the school confirms the proof (same flow as donations/contributions).

/** Numbers in a raffle, fixed at 100 (00–99) for now — the model carries `numberCount` so
 * other sizes can open later. 00–99 matches the Lotería Nacional, so "en combinación con la
 * lotería" works naturally. */
export const RAFFLE_NUMBER_COUNT = 100;
/**
 * Max numbers a single raffle order may reserve. Kept well below RAFFLE_NUMBER_COUNT so one order
 * can never lock the whole grid (a buyer splits a bigger purchase into more orders). Enforced server
 * side by the `reserveRaffleNumbers` Cloud Function arbiter (mirrored in functions/src/raffle-logic.ts,
 * drift-guarded in lib/firestore/raffle-arbiter.test.ts), which is the SOLE creator of raffleOrders —
 * firestore.rules deny direct client creates. The arbiter also enforces, in a transaction, what the
 * rules can't: number uniqueness across orders + a per-buyer pending cap, the complete #N1 grid-lock
 * fix (see SECURITY-BASELINE).
 */
export const RAFFLE_ORDER_NUMBERS_MAX = 25;
/** Up to three prizes (first required). */
export const RAFFLE_PRIZES_MAX = 3;
export const RAFFLE_PRIZE_MAX = 80;
/** "Modalidad del sorteo" — how the winning number is determined/announced (free text). */
export const RAFFLE_METHOD_MAX = 140;

export interface RaffleConfig {
  /** When the winning number is drawn (optional, informational). */
  drawDate?: Timestamp;
  /** How many numbers the raffle has (currently always RAFFLE_NUMBER_COUNT). */
  numberCount: number;
  /** Price the school charges per number, in `currency`. Informational — the platform never
   * collects it; it only labels the total the buyer pays the school directly. */
  pricePerNumber: number;
  currency: ProjectCurrency;
  /** 1–3 prizes; the first is required. Free text + numbers. */
  prizes: string[];
  /** "Modalidad del sorteo": e.g. "En combinación con la Lotería Nacional". */
  drawMethod: string;
}

// ── Guided tour (type: 'guided_tour') — a sequenced, media-rich activity ──────
//
// A guided tour ("visita guiada") is an ordered sequence of stages (etapa 1, 2, 3…), each
// with a name, a description of what it includes, up to TOUR_STAGE_PHOTO_MAX photos and one
// short video (≤ TOOL_VIDEO_MAX_SECONDS). Its config lives on the tool doc under `tour`. The
// public page shows the stages in order and ends with a "Preguntar" button that opens
// WhatsApp. PURELY INFORMATIONAL like every tool — there is nothing to pay; it only links out.

/** Stages per tour, and media per stage. Enforced by the panel UI, not by rules. */
export const TOUR_STAGE_MAX = 12;
export const TOUR_STAGE_TITLE_MAX = 120;
export const TOUR_STAGE_DESCRIPTION_MAX = 500;
/** Up to five photos per stage (the user-facing cap for the guided tour). */
export const TOUR_STAGE_PHOTO_MAX = 5;

/**
 * Short-video caps shared by every tool kind that attaches one (guided-tour stages, sale
 * products…). A tool's video must be at most one minute; the UI probes the file's duration
 * before upload (a small tolerance is applied so a 60.0s clip isn't rejected on rounding), and
 * caps the size client-side. The storage rule backstop (videoMax) sits above TOOL_VIDEO_MAX_MB,
 * mirroring how images cap at 5 MB in the UI but the rule allows more headroom.
 */
export const TOOL_VIDEO_MAX_SECONDS = 60;
export const TOOL_VIDEO_MAX_MB = 64;

/**
 * One step of a guided tour, embedded in the tour config. Ordered by array position
 * (stage 1 = stages[0]). Media (photos + a video) lives in Storage; the doc holds the
 * public download URLs (schools/{id}/tools/{toolId}/...), same as a project stage.
 */
export interface TourStage {
  title: string;
  /** What this stage includes. */
  description: string;
  /** Public Storage URLs, up to TOUR_STAGE_PHOTO_MAX. */
  photos?: string[];
  /** Public Storage URL of a single short video (≤ TOOL_VIDEO_MAX_SECONDS). */
  videoUrl?: string;
}

export interface TourConfig {
  /** Ordered stages shown in sequence on the public page. */
  stages: TourStage[];
  /**
   * LEGACY — superseded by the tool-level `Tool.contactPhone`; only read as a fallback for docs
   * saved before the unification (toolContactPhone migrates it up on the next save). Never written.
   */
  contactPhone?: string;
}

// ── Sale / "Productos" (type: 'sale') — a small product catalog ───────────────
//
// A school's product catalog: a list of products (e.g. "Huevos de la granja de la escuela"),
// each with a name, a description, up to TOOL/SALE photos and one short video, and a price. The
// config lives on the tool doc under `sale`. The public page shows each product with a "Comprar"
// button (the raffle-style order flow: reserve → pay the school → school confirms the proof) and
// a "Consultar" button that opens WhatsApp. PURELY INFORMATIONAL: the platform never processes
// the money. One currency for the whole catalog (the school's), like a project.

/** Products per catalog, and the per-product text caps (photos reuse SALE_PRODUCT_PHOTO_MAX,
 * the video reuses the tool-wide TOOL_VIDEO_MAX_*). Enforced by the panel UI, not by rules. */
export const SALE_PRODUCT_MAX = 24;
export const SALE_PRODUCT_NAME_MAX = 120;
export const SALE_PRODUCT_DESCRIPTION_MAX = 500;
export const SALE_PRODUCT_PHOTO_MAX = 5;
/** Defensive cap on a single order's quantity (anti-typo; the platform never moves money). */
export const PRODUCT_ORDER_QTY_MAX = 10_000;

/**
 * One product in a sale catalog, embedded in the tool's `sale` config. `id` is a STABLE id
 * (assigned at creation, preserved across edits) so a product order can reference the exact
 * product even as the catalog is reordered/edited — unlike a tour stage, which is positional.
 */
export interface SaleProduct {
  /** Stable id, referenced by product orders. */
  id: string;
  name: string;
  description: string;
  /** Public Storage URLs, up to SALE_PRODUCT_PHOTO_MAX. */
  photos?: string[];
  /** Public Storage URL of a single short video (≤ TOOL_VIDEO_MAX_SECONDS). */
  videoUrl?: string;
  /** Price per unit, in the catalog's `currency`. */
  price: number;
}

export interface SaleConfig {
  /** The products on offer. */
  products: SaleProduct[];
  /** One currency for the whole catalog. */
  currency: ProjectCurrency;
  /**
   * LEGACY — superseded by the tool-level `Tool.contactPhone`; only read as a fallback for docs
   * saved before the unification (toolContactPhone migrates it up on the next save). Never written.
   */
  contactPhone?: string;
}

// ── Service / "Servicios" (type: 'service') — a service catalog ───────────────
//
// Essentially "Productos" WITHOUT the order flow: a list of services the school community
// offers (e.g. "Clases de repaso", "Corte de cabello"), each with a name, a description, up to
// SERVICE_PHOTO_MAX photos and one short video, and an OPTIONAL price (many services are
// quote-based — leave it blank for "consultar"). The only public action is a per-service
// "Preguntar" button that opens WhatsApp; there is no "Comprar", no order, no payment data —
// nothing the platform could process. The config lives on the tool doc under `service`.

/** Services per catalog, and the per-service text caps (photos reuse SERVICE_PHOTO_MAX, the
 * video reuses the tool-wide TOOL_VIDEO_MAX_*). Enforced by the panel UI, not by rules. */
export const SERVICE_ITEM_MAX = 24;
export const SERVICE_NAME_MAX = 120;
export const SERVICE_DESCRIPTION_MAX = 500;
export const SERVICE_PHOTO_MAX = 5;
/** Short free-text schedule/availability per service ("Lun a vie, 2–6 pm"). */
export const SERVICE_AVAILABILITY_MAX = 120;

/**
 * How a service is delivered. A service may offer more than one (a tutor could be both
 * presencial and virtual), so it's stored as a set. Purely descriptive — shown as chips.
 */
export type ServiceModality = "in_person" | "at_home" | "virtual";

/** The modalities in display order, for rendering the editor toggles + the public chips. */
export const SERVICE_MODALITIES: ServiceModality[] = [
  "in_person",
  "at_home",
  "virtual",
];

/** Spanish labels for the modality chips (the only screen-visible part of the enum). */
export const SERVICE_MODALITY_LABELS: Record<ServiceModality, string> = {
  in_person: "Presencial",
  at_home: "A domicilio",
  virtual: "Virtual",
};

/**
 * One service in a catalog, embedded in the tool's `service` config. `id` is a stable id
 * (assigned at creation, preserved across edits) so the edit page can match a service's media
 * by identity. Unlike a product it is referenced by nothing external (there is no order flow).
 */
export interface ServiceItem {
  /** Stable id (React key + edit-page media match). */
  id: string;
  name: string;
  description: string;
  /** Public Storage URLs, up to SERVICE_PHOTO_MAX. */
  photos?: string[];
  /** Public Storage URL of a single short video (≤ TOOL_VIDEO_MAX_SECONDS). */
  videoUrl?: string;
  /** Optional price per service, in the catalog's `currency`. Omitted when quote-based. */
  price?: number;
  /** When true (and a `price` is set), the price is a starting point — shown as "Desde ₡X". */
  priceFrom?: boolean;
  /** How the service is delivered (presencial / a domicilio / virtual). Omitted when unset. */
  modalities?: ServiceModality[];
  /** Free-text schedule/availability (≤ SERVICE_AVAILABILITY_MAX). Omitted when blank. */
  availability?: string;
}

export interface ServiceConfig {
  /** The services on offer. */
  services: ServiceItem[];
  /** One currency for the whole catalog (used only to format the prices that are set). */
  currency: ProjectCurrency;
  /**
   * LEGACY — superseded by the tool-level `Tool.contactPhone`; only read as a fallback for docs
   * saved before the unification (toolContactPhone migrates it up on the next save). Never written.
   */
  contactPhone?: string;
}

// ── Event / "Eventos" (type: 'event') — a one-off happening ───────────────────
//
// A single dated event the school announces (a feria, a graduación, una kermés): a name + rich
// description, a gallery (photos + one short video), WHEN (date + time) and WHERE (a place + an
// optional map link), and a single "Preguntar" button that opens WhatsApp. The public page also
// offers an "Agregar al calendario" link and emits Event JSON-LD for search rich results. Unlike
// the catalog kinds there is no list of items and no order flow — there is nothing to pay; it
// only informs and links out. The config lives on the tool doc under `event`.

/** Free-text place cap; the gallery reuses the tool-wide photo/video caps. */
export const EVENT_PLACE_MAX = 140;
export const EVENT_PHOTO_MAX = 5;

export interface EventConfig {
  /** When the event happens (date + time). Optional in storage (Firestore rejects undefined),
   * but the panel form requires it — an event without a date isn't useful. */
  date?: Timestamp;
  /** Where it happens (free text, ≤ EVENT_PLACE_MAX). Omitted when blank. */
  place?: string;
  /** Optional map link (Google Maps / Waze). Scheme-checked on write (safeExternalUrl). */
  mapUrl?: string;
  /** Gallery: public Storage URLs, up to EVENT_PHOTO_MAX. */
  photos?: string[];
  /** A single short promo video (≤ TOOL_VIDEO_MAX_SECONDS). */
  videoUrl?: string;
  /** LEGACY — superseded by the tool-level `Tool.contactPhone`; read-only fallback for old docs. */
  contactPhone?: string;
}

// ── Bingo (type: 'bingo') — a card-based fundraiser game ──────────────────────
//
// A bingo sells cartones (cards): each a grid of distinct random numbers. The lote (often
// 100+) lives in a SUBCOLLECTION schools/{id}/tools/{toolId}/cards (one doc per cartón) so the
// public tool doc stays light; the config below lives on the tool doc under `bingo`. Buyers
// reserve a QUANTITY of cartones (bingoOrders) and pay the school directly; the school confirms
// the proof and ASSIGNS that many available cartones to the buyer. PURELY INFORMATIONAL like
// every tool — the platform never processes money. Phase 1 covers setup + selling + assignment;
// the live event (called numbers, claims, validation) is phase 2.

/** Lote size + grid bounds + per-pattern prize cap. Enforced by the panel UI, not by rules. */
export const BINGO_CARD_MAX = 1000;
export const BINGO_GRID_MIN = 3;
export const BINGO_GRID_MAX = 9;
export const BINGO_LABEL_MAX = 40;
export const BINGO_PRIZE_MAX = 80;
/** Cap on how many extra ("otros") prizes a bingo can list, beyond the ranked top three. */
export const BINGO_OTHER_PRIZES_MAX = 8;
export const BINGO_METHOD_MAX = 140;
/** Cap on the free-space center label (BingoCenterSquare text) — the center cell is tiny, so keep
 * it short enough to stay legible even in the small live-console cartón render. */
export const BINGO_CENTER_TEXT_MAX = 12;
/** Sentinel stored at a free center cell in a cartón's `numbers[]` (in place of a real number):
 * the classic 5×5 "casilla central libre" carries no callable number. Out of every valid pool band,
 * so it never collides with a real number and never matches a called one. The center treatment is a
 * MAZO (deck) property — see BingoDeck.centerSquare — frozen onto each bingo built from the deck. */
export const BINGO_FREE_CENTER = -1;
/** Defensive cap on one order's quantity (anti-typo; the platform never moves money). */
export const BINGO_ORDER_QTY_MAX = 100;
/** Cells of the fixed 5×5 grid every winning pattern is defined on (indices 0..24, row-major). */
export const BINGO_GRID_CELLS = 25;
/** Cap on a saved custom-pattern name. */
export const BINGO_CUSTOM_PATTERN_NAME_MAX = 40;
/** Cap on how many custom patterns a school can save in its catalog. */
export const BINGO_CUSTOM_PATTERNS_MAX = 30;
/** Cap on a saved deck (mazo) name. */
export const BINGO_DECK_NAME_MAX = 60;

/** A winning shape on a cartón. A "line" means a COMPLETE row/column/diagonal; `full` = the
 * whole cartón marked. The organizer enables which ones count, each with its prize. */
export type BingoPattern = "row" | "column" | "diagonal" | "full";

export const BINGO_PATTERNS: BingoPattern[] = ["row", "column", "diagonal", "full"];

/** Spanish labels for the patterns (the only screen-visible part of the enum). */
export const BINGO_PATTERN_LABELS: Record<BingoPattern, string> = {
  row: "Línea horizontal",
  column: "Línea vertical",
  diagonal: "Diagonal",
  full: "Cartón lleno",
};

/**
 * A winning shape ("modalidad / forma de ganar") on the fixed 5×5 grid (indices 0..24, row-major),
 * built-in OR a school's custom one. The live director picks ONE per round. `arrangements` is the
 * sole validation truth: each inner array is one complete winning placement; a cartón wins when the
 * called numbers cover EVERY cell of SOME arrangement. `preview` is the cell mask the visual aid
 * highlights — for single-shape patterns it equals arrangements[0]; for "any-of" families (line,
 * diagonal, double line) it's one representative placement plus a Spanish `caption` so the aid stays
 * legible. Custom patterns store a single arrangement (the exact drawn cells). The geometry of the
 * built-ins lives in @/lib/bingo-patterns (BINGO_BUILTIN_PATTERNS).
 */
export interface PatternDef {
  /** Stable id: a built-in key (e.g. "line") or "custom:<docId>" / "custom:adhoc". */
  id: string;
  /** Spanish name shown to director, players and the public. */
  name: string;
  kind: "builtin" | "custom";
  arrangements: number[][];
  preview: number[];
  caption?: string;
}

/**
 * The FROZEN snapshot of the round's winning shape, denormalized onto the event-state doc and onto
 * every claim — so validation needs no catalog read and is immune to later catalog edits. It's a
 * PatternDef without `kind` (and JSON/Firestore-serializable — no Timestamps).
 */
export interface BingoActivePattern {
  id: string;
  name: string;
  arrangements: number[][];
  preview: number[];
  caption?: string;
}

/**
 * The single prize a round plays for (Costa Rica dynamic: one prize per round, played minor → major,
 * the premio mayor last). Frozen onto the event-state doc next to `activePattern` so players see
 * what's at stake. `isGrand` marks the premio-mayor round — confirming its winner ends the whole
 * bingo. The `label` is the prize text the school configured (never anything personal).
 */
export interface BingoActivePrize {
  label: string;
  isGrand: boolean;
}

/**
 * The confirmed winner of a round, denormalized onto the public event-state doc so every watcher
 * sees the result live. Identified by the CARTÓN LABEL only — never the person's name: the modality
 * is presencial-virtual (the name may be unknown) and names are not exposed for privacy. The school
 * still confirms against the authoritative claim; this is only the public announcement.
 */
export interface BingoWinner {
  /** The winning cartón's label/serial (e.g. "042"), as called out in a live bingo. */
  cardLabel: string;
  /** The prize this round was for, copied from the round's `activePrize`. */
  prizeLabel: string;
  /** True when this was the premio-mayor round — i.e. the bingo itself just ended. */
  isGrand: boolean;
}

/**
 * A school's saved custom pattern, a doc in schools/{schoolId}/bingoPatterns/{patternId} — reusable
 * across that school's bingos. Holds only a name + the drawn cells (no sensitive data); the live
 * arrangement derives as [cells]. The director writes these directly (no function-maintained
 * signals; the anti-cheat truth is the frozen activePattern snapshot, never the catalog).
 */
export interface SavedBingoPattern {
  name: string;
  /** Distinct cell indices in 0..24 (length 1..25). */
  cells: number[];
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
}

export type SavedBingoPatternDoc = SavedBingoPattern & { id: string };

/** The cartón grid + number pool. Every cell holds a distinct number in [poolMin, poolMax];
 * a valid format needs the pool size (poolMax − poolMin + 1) to be ≥ rows*cols. */
export interface BingoFormat {
  rows: number;
  cols: number;
  poolMin: number;
  poolMax: number;
}

/** One enabled winning pattern and what its winner gets. */
export interface BingoWinningPattern {
  pattern: BingoPattern;
  prize: string;
}

/**
 * The bingo's prizes, decoupled from the winning patterns. A ranked top three (a required
 * `first`/"premio mayor", optional `second`/`third`) plus any number of extra unranked prizes
 * (`others`). The winning SHAPE is no longer tied to a prize here — the live director picks the
 * shape per round; these are simply the prizes the school is offering.
 */
export interface BingoPrizes {
  /** Premio mayor — always present. */
  first: string;
  /** Segundo premio — omitted when not offered. */
  second?: string;
  /** Tercer premio — omitted when not offered. */
  third?: string;
  /** Extra prizes beyond the top three, in listed order (each non-empty). */
  others: string[];
}

/**
 * The classic 5×5 "casilla central": in physical Costa Rican bingo the middle cell is a FREE space
 * (often the deck-maker's logo, or blank) rather than a callable number. When a bingo sets this, the
 * center cell (row-major index 12 of a 5×5) auto-counts as marked for every winning pattern that
 * crosses it and shows this content instead of a number; absent = traditional numbered center
 * (default). Offered only on the 5×5 grid (the only one with a single middle cell).
 */
export type BingoCenterSquareType = "blank" | "text" | "image";

export interface BingoCenterSquare {
  type: BingoCenterSquareType;
  /** Short free-space label (type === 'text'), ≤ BINGO_CENTER_TEXT_MAX chars. */
  text?: string;
  /** Logo/image URL (type === 'image'), a Storage download URL under the tool's assets path. */
  imageUrl?: string;
}

export interface BingoConfig {
  format: BingoFormat;
  /** The prizes the school offers (premio mayor + optional 2nd/3rd + extras). Optional only so
   * legacy bingos (created before prizes were decoupled from patterns) still read; every write
   * sets it. */
  prizes?: BingoPrizes;
  /** Enabled winning patterns, in play order; at least one required. Not configured by the
   * board anymore (defaulted at creation) — kept for the live event, which will let the
   * director pick the winning shape per round. */
  patterns: BingoWinningPattern[];
  /** Price the school charges per cartón, in `currency`. Informational — the platform never
   * collects it; it only labels the total the buyer pays the school directly. */
  pricePerCard: number;
  currency: ProjectCurrency;
  /** When the live event happens (optional, informational). */
  eventDate?: Timestamp;
  /** "Modalidad": how the bingo is run/announced (free text, optional). */
  drawMethod?: string;
  /** LEGACY — superseded by the tool-level `Tool.contactPhone`; read-only fallback for old docs. */
  contactPhone?: string;
  /**
   * Marking assistance for players. Default (absent/false) = traditional mode: the player marks
   * EVERY cell by hand and may err, so the system never restricts which cells are tappable and the
   * school's review of a "¡Bingo!" claim is meaningful. When `true` (easy mode), only called numbers
   * are tappable, so a marked pattern is always legitimate by construction. Validation is always
   * authoritative (called ∩ cartón) regardless; this flag only changes the player's marking UX.
   */
  assistMarking?: boolean;
  /** Classic 5×5 free-space center (logo/text/blank). Absent = traditional numbered center. */
  centerSquare?: BingoCenterSquare;
}

export type BingoCardStatus = "available" | "sold";

/** One cartón of a bingo lote, a doc in schools/{id}/tools/{toolId}/cards/{cardId}. `numbers`
 * is row-major (length rows*cols), distinct, within the format's pool. Cards are written ONLY
 * by the school (the numbers are integrity-critical; a buyer never edits them); a card is
 * assigned to a buyer when their order is confirmed. */
export interface BingoCard {
  /** Printed serial/identifier shown to players (e.g. "001"). */
  label: string;
  /** Row-major grid numbers, length = rows*cols, distinct, within the pool. */
  numbers: number[];
  status: BingoCardStatus;
  /** The confirmed bingoOrder that owns this cartón (set on assignment). */
  soldOrderId?: string;
  /** The buyer who owns this cartón (= that order's buyerId), for the buyer's "my cards" view. */
  ownerId?: string;
  createdAt: Timestamp;
}

export type BingoCardDoc = BingoCard & { id: string };

/**
 * A reusable deck (mazo) of cartones a school saves once and reuses across many bingos — a doc in
 * schools/{schoolId}/bingoDecks/{deckId}, parallel to the custom-pattern catalog (bingoPatterns).
 * Holds only the deck's name, its cartón format and a denormalized count; the cartones themselves
 * live in the subcollection `bingoDecks/{deckId}/cards` (one doc per cartón), mirroring a tool's
 * lote so a 1000-cartón deck never strains the doc-size limit. The deck is a TEMPLATE — its cards
 * carry no status/ownerId; creating a bingo from a deck COPIES its cartones into that tool's `cards`
 * as fresh `available` ones, so per-event sold/assignment state never collides between bingos. The
 * school owns every field (no function-maintained signals, no money).
 */
export interface BingoDeck {
  name: string;
  /** The cartón grid + number pool every cartón in the deck shares (a bingo built from this deck
   * adopts this format so its config and the copied cartones line up). */
  format: BingoFormat;
  /** Classic 5×5 free-space center (logo/text/blank). Set once at deck creation and frozen: the
   * deck's cartones carry a BINGO_FREE_CENTER sentinel at the center, and a bingo built from this
   * deck copies this onto its config (BingoConfig.centerSquare). Absent = traditional numbered
   * center. Only meaningful on the 5×5 grid. */
  centerSquare?: BingoCenterSquare;
  /** Denormalized cartón count, for the picker list (the cards live in a subcollection). */
  cardCount: number;
  createdBy: string;
  createdByName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BingoDeckDoc = BingoDeck & { id: string };

/** One template cartón of a deck, a doc in schools/{id}/bingoDecks/{deckId}/cards/{cardId}. Unlike
 * a tool's BingoCard it carries NO status/ownerId — those are per-event and set only when the deck
 * is copied into a bingo's lote. */
export interface BingoDeckCard {
  /** Printed serial/identifier (e.g. "001"), preserved when the deck is copied into a bingo. */
  label: string;
  /** Row-major grid numbers, length = rows*cols, distinct, within the format's pool. */
  numbers: number[];
  createdAt: Timestamp;
}

export type BingoDeckCardDoc = BingoDeckCard & { id: string };

// ── Pageant (type: 'pageant') — "Reinado escolar" ────────────────────────────
//
// A school pageant ("reinado escolar"): a roster of candidates the community backs to build
// community AND raise funds. Two never-summed tallies per candidate — a FREE "simpatía" applause
// count and an ECONOMIC "apoyo" count (the existing pending→proof→school-confirms order rail,
// pageantVotes) — plus the school's jury score. The crown is the school's HUMAN verdict, never a
// platform-computed outcome; a weighted formula only SUGGESTS a ranking. PURELY INFORMATIONAL like
// every tool — the platform never processes money. Only the config below lives on the tool doc
// (under `config`); the roster, the applause ledger, the economic votes and the live coronación are
// heavy subcollections / a top-level collection keyed by {schoolId, toolId}, wired in later slices
// (see docs/school-pageant.md).

/** Free-text caps for the pageant config (enforced by the panel UI + rules). */
export const PAGEANT_CRITERIA_MAX = 600;
export const PAGEANT_CAUSE_MAX = 300;

/**
 * Weights of the crown formula (the school's "mixta" choice). Each is an integer 0..100 and the
 * three SHOULD sum to 100 (the panel enforces it). The formula only orders a SUGGESTED ranking; the
 * school still ratifies the winner by hand. When free voting is off, the `sympathy` axis is dropped
 * and the other two are renormalized (see lib/firestore/pageant — effectiveWeights, later slice).
 */
export interface PageantCrownFormula {
  /** Weight of the school-entered jury score. */
  jury: number;
  /** Weight of confirmed economic support ("apoyo"). */
  support: number;
  /** Weight of free applause ("simpatía"). */
  sympathy: number;
}

/** Suggested default split — jury-led, with the two community axes balanced and non-binding. */
export const PAGEANT_DEFAULT_CROWN_FORMULA: PageantCrownFormula = {
  jury: 40,
  support: 30,
  sympathy: 30,
};

/**
 * The pageant's configuration, stored on the tool doc under `config`. The roster of candidates, the
 * applause ledger, the economic votes and the live coronación are NOT here — they are heavy
 * subcollections / a top-level collection keyed by {schoolId, toolId} (see docs/school-pageant.md).
 */
export interface PageantConfig {
  /** Criteria/values of the pageant (free text, shown publicly). */
  criteria?: string;
  /** What the funds are for (free text). */
  cause?: string;
  /** Voting window: opens/closes (informational + a soft UI gate; the CF also validates it). */
  opensAt?: Timestamp;
  closesAt?: Timestamp;
  /** Currency of the economic support. */
  currency: ProjectCurrency;
  /** Informational price per support unit — NOT a charge; it only bounds the recorded relationship
   * (like a raffle's pricePerNumber). The platform never moves money. */
  pricePerSupportUnit: number;
  /** Whether the free "simpatía" applause layer is on. Default false until App Check is proven in
   * prod — until then a non-tamper-proof count must never weigh on a real crown. */
  freeVotingEnabled: boolean;
  /** Weights of the crown formula (the school's mixta choice). */
  crownFormula: PageantCrownFormula;
  /** Optional destination project: when set, the support feeds that project's ProjectProgress. */
  fundProjectId?: string;
}

/** Caps for a pageant's candidate roster (enforced by the panel UI + rules). */
export const PAGEANT_CANDIDATES_MAX = 40;
export const PAGEANT_CANDIDATE_NAME_MAX = 80;
export const PAGEANT_CANDIDATE_BIO_MAX = 600;
/** Jury score is an integer 0..100 (the school's human input). */
export const PAGEANT_JURY_SCORE_MAX = 100;
/** A candidate's presentation carousel: up to 5 images plus at most 1 short video. The video
 * reuses the tool-wide short-clip budget (TOOL_VIDEO_MAX_SECONDS / TOOL_VIDEO_MAX_MB). */
export const PAGEANT_CANDIDATE_PHOTOS_MAX = 5;
export const PAGEANT_CANDIDATE_MEDIA_MAX = 6; // 5 images + 1 video (the list cap, enforced in rules)

/** One slide of a candidate's presentation carousel: a public Storage URL plus its kind. */
export interface CandidateMediaItem {
  type: "image" | "video";
  /** Public Storage URL, on the tool's asset path (uploadToolStageAsset). */
  url: string;
}

/**
 * One candidate of a reinado, a doc in schools/{schoolId}/tools/{toolId}/candidates/{candidateId}.
 * The school owns name/bio/media/order and the HUMAN `juryScore`; the four tally fields are
 * Cloud-Function-maintained (the client can't write them — rules freeze them) and read 0 until a
 * later slice wires the CFs. The crown is the school's verdict; pageantStandings only SUGGESTS a
 * ranking from these (see lib/firestore/pageant).
 */
export interface Candidate {
  /** Candidate's display name. */
  name: string;
  /** Short bio / "por qué me postulo" (free text). */
  bio: string;
  /** Avatar cover: the first image of `media`, kept in sync on save. Legacy docs (pre-`media`) carry
   * only this; reads normalize it into `media` via `candidateMediaOf`. */
  photoUrl?: string;
  /** Ordered presentation carousel (up to 5 images + 1 video). Source of truth for the public
   * carousel; absent on legacy docs (fall back to `photoUrl`). */
  media?: CandidateMediaItem[];
  /** Presentation order in the roster (ascending). */
  order: number;
  /** The school's jury score, 0..100 — a HUMAN input (not function-maintained). */
  juryScore: number;
  /** (fn) Free "simpatía" applause count. Maintained by a Cloud Function; 0 until then. */
  voteFree: number;
  /** (fn) Confirmed economic "apoyo" count (sum of confirmed eligible support units). */
  voteSupport: number;
  /** (fn) Distinct confirmed supporters. */
  supportCount: number;
  /** (fn) Distinct confirmed recurring padrinos. */
  padrinoCount: number;
}

export type CandidateDoc = Candidate & { id: string };

/**
 * The per-kind configuration map stored under a tool's `config`. Exactly one kind's shape; which
 * one is told by the tool's `type` (raffle → RaffleConfig, …). Read it typed via
 * `toolConfigOf(tool, kind)` (lib/firestore) — it narrows this union for you. The catch-all
 * `other` kind carries no config. To add a kind, add its config type to this union.
 */
export type ToolConfig =
  | RaffleConfig
  | BingoConfig
  | SaleConfig
  | ServiceConfig
  | TourConfig
  | EventConfig
  | PageantConfig;

export interface Tool {
  /** Denormalized parent id (the doc lives under the school; kept for the detail page and
   * any query that starts from a tool). */
  schoolId: string;
  /** Denormalized so the detail page renders without an extra read. */
  schoolName: string;
  type: ToolType;
  title: string;
  description: string;
  /** Header image of the tool card/detail. */
  coverUrl?: string;
  /** Optional activity window (purely informational). */
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  /**
   * Optional WhatsApp contact for the tool's "Consultar" button: an alternate number to the
   * school's board phone (empty falls back to it) and a custom button label (empty defaults to
   * "Consultar"). Tool-level so every kind shares one contact — read with toolContactPhone /
   * toolContactLabel (lib/firestore), which also fall back to a kind's LEGACY config.contactPhone.
   */
  contactPhone?: string;
  contactLabel?: string;
  /**
   * The per-kind configuration, discriminated by `type` (its concrete shape is one member of
   * `ToolConfig`); absent for the catch-all `other`. Read it typed with `toolConfigOf(tool, kind)`
   * (lib/firestore). LEGACY: pre-refactor docs stored this under a per-kind field
   * (`raffle`/`tour`/`sale`/`service`/`bingo`/`event`); the data layer's normalizeTool folds those
   * into `config` on read, and any write re-stores it here and deletes the legacy field, so docs
   * self-heal on edit. See lib/firestore/tools.ts.
   */
  config?: ToolConfig;
  status: ToolStatus;
  /** Denormalized from the school so rules/UI resolve the board without an extra read. */
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ToolDoc = Tool & { id: string };

// ── raffleOrders/{orderId} ───────────────────────────────────────────────────
//
// A buyer's reservation of one or more raffle numbers, awaiting the school's payment
// confirmation. Top-level collection (like projectContributions) so its proof file and
// private subdoc resolve by id alone. The buyer's real name and the amount live in a PRIVATE
// subdoc (raffleOrders/{id}/private/data) — off the public doc — exactly like contributions.
// Number state for the public grid is derived from these orders:
//   pending  → "reservado" (gris, no seleccionable)
//   confirmed → "vendido"  (X / color característico)

export type RaffleOrderStatus = "pending" | "confirmed";

export interface RaffleOrder {
  schoolId: string;
  schoolName: string;
  toolId: string;
  /** Denormalized raffle title so the confirmation queue renders without an extra read. */
  toolTitle: string;
  /** The buyer (must equal auth.uid on create). */
  buyerId: string;
  /** The reserved numbers, 0-based indices into the raffle (00–99). */
  numbers: number[];
  currency: ProjectCurrency;
  status: RaffleOrderStatus;
  confirmedAt: Timestamp | null;
  confirmedBy?: string;
  /** Whether a payment proof was uploaded to Storage (the file itself stays private). */
  proofUploaded?: boolean;
  /** Merged in CLIENT-SIDE from the private subdoc for the board's confirmation queue —
   * NEVER stored on the public doc (firestore.rules excludes them). */
  buyerName?: string;
  amount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RaffleOrderDoc = RaffleOrder & { id: string };

// ── productOrders/{orderId} ──────────────────────────────────────────────────
//
// A buyer's order of one product from a school's "Productos" catalog (a tool of `type: 'sale'`),
// awaiting the school's payment confirmation. Top-level (like raffleOrders/projectContributions)
// so its proof file and private subdoc resolve by id alone. The buyer's real name and the amount
// live in a PRIVATE subdoc (productOrders/{id}/private/data) — off the public doc — exactly like
// raffle orders. Products aren't limited inventory, so nothing is derived back onto the catalog.

export type ProductOrderStatus = "pending" | "confirmed";

export interface ProductOrder {
  schoolId: string;
  schoolName: string;
  toolId: string;
  /** Denormalized catalog (tool) title so the confirmation queue renders without an extra read. */
  toolTitle: string;
  /** Which product was ordered (SaleProduct.id) + a denormalized name snapshot. */
  productId: string;
  productName: string;
  /** Units ordered (integer ≥ 1). */
  quantity: number;
  currency: ProjectCurrency;
  /** The buyer (must equal auth.uid on create). */
  buyerId: string;
  status: ProductOrderStatus;
  confirmedAt: Timestamp | null;
  confirmedBy?: string;
  /** Whether a payment proof was uploaded to Storage (the file itself stays private). */
  proofUploaded?: boolean;
  /** Merged in CLIENT-SIDE from the private subdoc for the board's queue — NEVER on the public
   * doc (firestore.rules excludes them). */
  buyerName?: string;
  amount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ProductOrderDoc = ProductOrder & { id: string };

// ── bingoOrders/{orderId} ────────────────────────────────────────────────────
//
// A buyer's reservation of N cartones from a bingo (a tool of `type: 'bingo'`), awaiting the
// school's payment confirmation. Top-level (like raffleOrders/productOrders) so its proof file
// and private subdoc resolve by id alone. The buyer's real name and the amount live in a
// PRIVATE subdoc (bingoOrders/{id}/private/data) — off the public doc. The buyer reserves a
// QUANTITY (not specific cartones); the school assigns that many available cartones on confirm,
// recording their ids in `cardIds`.

export type BingoOrderStatus = "pending" | "confirmed";

export interface BingoOrder {
  schoolId: string;
  schoolName: string;
  toolId: string;
  /** Denormalized bingo title so the confirmation queue renders without an extra read. */
  toolTitle: string;
  /** The buyer (must equal auth.uid on create). */
  buyerId: string;
  /** Cartones requested (integer ≥ 1). */
  quantity: number;
  currency: ProjectCurrency;
  status: BingoOrderStatus;
  /** The cartones assigned to the buyer, set by the school on confirmation. */
  cardIds?: string[];
  confirmedAt: Timestamp | null;
  confirmedBy?: string;
  /** Whether a payment proof was uploaded to Storage (the file itself stays private). */
  proofUploaded?: boolean;
  /** Merged in CLIENT-SIDE from the private subdoc for the board's queue — NEVER on the public
   * doc (firestore.rules excludes them). */
  buyerName?: string;
  amount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BingoOrderDoc = BingoOrder & { id: string };

// ── pageantVotes/{voteId} ─────────────────────────────────────────────────────
//
// A supporter's recorded ECONOMIC support ("apoyo") for one candidate of a reinado (a tool of
// `type: 'pageant'`), awaiting the school's confirmation. Top-level (like raffle/product/bingo
// orders) so its proof file and private subdoc resolve by id alone. The supporter's real name and
// the amount live in a PRIVATE subdoc (pageantVotes/{id}/private/data) — off the public doc. The
// `units` are a COUNT of support units, NOT a charge: the platform never moves money; the supporter
// pays the school directly and the school confirms. On confirmation a Cloud Function recomputes the
// candidate's voteSupport tally (with the verified + no-self-dealing anti-fraud gate) — a later slice.

export const PAGEANT_SUPPORT_UNITS_MAX = 1000;

export type PageantVoteStatus = "pending" | "confirmed";

export interface PageantVote {
  schoolId: string;
  schoolName: string;
  toolId: string;
  /** Denormalized reinado title so the confirmation queue renders without an extra read. */
  toolTitle: string;
  /** Which candidate the support backs + a denormalized name snapshot. */
  candidateId: string;
  candidateName: string;
  /** The supporter (must equal auth.uid on create). */
  buyerId: string;
  /** Support units (integer 1..PAGEANT_SUPPORT_UNITS_MAX) — a COUNT, never a money figure. */
  units: number;
  currency: ProjectCurrency;
  status: PageantVoteStatus;
  confirmedAt: Timestamp | null;
  confirmedBy?: string;
  /** Whether a payment proof was uploaded to Storage (the file itself stays private). */
  proofUploaded?: boolean;
  /** Merged in CLIENT-SIDE from the private subdoc for the board's queue — NEVER on the public
   * doc (firestore.rules excludes them). */
  buyerName?: string;
  amount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PageantVoteDoc = PageantVote & { id: string };

/**
 * One ballot in a reinado's free "simpatía" applause ledger
 * (`schools/{schoolId}/tools/{toolId}/applause/{ballotId}`). CLOUD-FUNCTION-ONLY: the rules deny all
 * client read/write (`if false`); the public reads `candidate.voteFree` (the COUNT), never the
 * ledger. The accountless voter leaves a trace only here (+ a UX memory in localStorage). The ballot
 * id is deterministic — `sha256(toolId + voterKey)` — so one device casts at most one vote per
 * pageant: a re-tap hits the same doc and is a no-op, and the vote is locked to the first candidate
 * chosen. No PII, no money — just which candidate, plus coarse hashes for dedup and a future
 * rate-cap. Written by `castPageantApplause` (which verifies App Check first) with the Admin SDK.
 */
export interface PageantApplauseBallot {
  /** The candidate this device applauded. */
  candidateId: string;
  /** sha256 of the device's localStorage voter key — the dedup substrate, never the raw key. */
  voterKeyHash: string;
  /** Coarse sha256 of the caller IP, kept for a future per-IP rate-cap; never an exact address. */
  ipHash: string;
  createdAt: Timestamp;
}

/**
 * The reinado's live coronación phase. registration → voting → gala (reveal + crown) → closed. The
 * director drives every transition by hand; nothing advances automatically.
 */
export type PageantPhase = "registration" | "voting" | "gala" | "closed";

/**
 * A reinado's live-event state (`schools/{schoolId}/tools/{toolId}/event/state` — the SAME doc shape
 * the bingo uses, sharing the public-read / school-write rule). One doc the school drives during the
 * coronación: the current phase, whether the SUGGESTED standings have been revealed at the gala, and
 * the school's HUMAN crown verdict. The platform NEVER auto-crowns — `winnerCandidateId` is the
 * school ratifying `pageantStandings` (a suggestion), never a platform-computed outcome. No money, no
 * function-maintained fields: the school owns every write.
 */
export interface PageantEventState {
  phase: PageantPhase;
  /** Whether the suggested standings are revealed publicly (the gala "reveal" moment). */
  revealed: boolean;
  /** The crowned candidate — the school's verdict, set at the gala (null/absent until then). */
  winnerCandidateId?: string | null;
  /** The runner-up candidate, same human verdict (optional). */
  runnerUpCandidateId?: string | null;
  /** When the live event first opened (stamped on the first phase write). */
  startedAt?: Timestamp;
  updatedAt: Timestamp;
}

// ── Bingo live event (Phase 2) ───────────────────────────────────────────────
//
// The live game: the school "calls" numbers one by one; virtual players watch the board in
// real time (onSnapshot) and MANUALLY mark the called numbers on their owned cartones. A player
// who completes an enabled pattern cants "¡Bingo!" → a CLAIM doc. The school re-validates the
// claim (called ∩ cartón forms the pattern) and awards it. The system never auto-declares a
// winner, and a passive player who never marks can't claim — the "precio a pagar" that keeps
// the live experience. No money, no function-maintained fields: the school owns every write.

/** Cap on a claimant's denormalized display name (the only screen-visible PII on a claim). */
export const BINGO_CLAIM_NAME_MAX = 80;

/** The live event's lifecycle: not started → calling numbers → finished. */
export type BingoEventStatus = "idle" | "live" | "closed";

/** Cap on the pause reason shown to players. */
export const BINGO_PAUSE_REASON_MAX = 80;

/**
 * A break the director announces mid-game (refrigerio, sorteo, etc.). Both fields are optional: the
 * director may give just a reason, just a duration, or neither. While set the game stays `live` (the
 * round isn't lost) — players just see a "Bingo en pausa" notice. `minutes` drives the public
 * countdown (from `startedAt`); when it elapses the notice flips to "reiniciamos en cualquier
 * momento". Cleared (null) on resume and whenever a round/bingo (re)starts.
 */
export interface BingoPause {
  /** Announced duration in minutes (absent/null if none) — the public countdown's length. */
  minutes?: number | null;
  /** Why the game is paused, shown to players (absent/null if none). */
  reason?: string | null;
  /** When the pause began (server time) — the countdown counts down from here. */
  startedAt: Timestamp;
}

/**
 * The single live-event state doc of a bingo: schools/{id}/tools/{toolId}/event/state. Read is
 * public (virtual players watch the board live); only the school writes it. `calledNumbers` is
 * append-order (the order the tómbola drew them). `activePattern` is the FROZEN winning shape the
 * director chose for THIS round (one per round) — the "cómo ganar" players and the public see.
 * Each round plays for ONE prize (`activePrize`) at ONE shape (`activePattern`); confirming that
 * round's single winner (`winner`) ends the round, and the premio-mayor round ends the bingo. The
 * console (owner/editor) maintains the public `reviewing`/`winner` signals as the denormalizer — so
 * every watcher sees "alguien cantó" and the result without reading the private claims.
 */
export interface BingoEventState {
  status: BingoEventStatus;
  /** Numbers drawn so far, in call order (distinct, within the format's pool). */
  calledNumbers: number[];
  /** The round's winning shape (frozen snapshot). Absent on legacy docs (pre-per-round patterns). */
  activePattern?: BingoActivePattern | null;
  /** The prize THIS round plays for (one per round, minor → major). Absent on legacy docs. */
  activePrize?: BingoActivePrize | null;
  /** True while a "¡Bingo!" claim of the current round is pending the school's review. Maintained by
   * the console so all watchers can show "alguien cantó — revisando" (they can't read claims). */
  reviewing?: boolean;
  /** The confirmed winner of the round, by cartón label (never a name). Present once the school
   * confirms; cleared when the next round starts. On a premio-mayor round it stays as the final
   * result and `status` flips to 'closed'. */
  winner?: BingoWinner | null;
  /** Prize labels already won THIS bingo (appended on each confirmation), so the picker can skip a
   * prize that's already been awarded. Reset when a brand-new bingo starts after a 'closed' one. */
  awardedPrizes?: string[];
  /** LEGACY/unused: the awarded-prize count was DERIVED from confirmed claims under the old
   * multi-prize-per-round model. Kept optional only so old docs that still carry it read. */
  awardedCount?: number;
  /** LEGACY: patterns awarded under the old multi-pattern model. Kept so old docs still read. */
  awardedPatterns?: BingoPattern[];
  /** Set while the director pauses the live game; null/absent when running. */
  pause?: BingoPause | null;
  startedAt?: Timestamp;
  closedAt?: Timestamp;
  updatedAt: Timestamp;
}

export type BingoClaimStatus = "pending" | "confirmed" | "rejected";

/**
 * A player's "¡Bingo!" — a doc in schools/{id}/tools/{toolId}/claims/{claimId}. Created by the
 * cartón's OWNER (claimantId == auth.uid == card.ownerId) naming the pattern they completed. The
 * school re-validates (the truth is calledNumbers ∩ cartón) and confirms or rejects; the system
 * never auto-awards. Read is limited to the claimant and the school (it carries a name).
 */
export interface BingoClaim {
  cardId: string;
  /** Denormalized cartón serial so the board's queue renders without an extra read. */
  cardLabel: string;
  /** The round's pattern id + name (for the queue label only). The school re-validates the win
   * against the event's authoritative activePattern, not anything carried on the claim. */
  patternId: string;
  patternName: string;
  /** LEGACY enum pattern (old claims, before per-round patterns). Optional for old-doc reads. */
  pattern?: BingoPattern;
  claimantId: string;
  claimantName: string;
  status: BingoClaimStatus;
  resolvedAt?: Timestamp | null;
  resolvedBy?: string;
  createdAt: Timestamp;
}

export type BingoClaimDoc = BingoClaim & { id: string };

// ── projectContributions/{id} ────────────────────────────────────────────────

/**
 * How someone contributes to a project. Both carry a monetary `amount` (in the project's
 * currency) that advances the progress bar once confirmed — by design there is ONE flow,
 * not two:
 * - `money`: a cash contribution. `amount` is what was paid.
 * - `in_kind`: a donation in goods or labour (e.g. "I'll donate the tank", "I'll do the
 *   site prep"). `amount` is its ASSESSED VALUE — the cost of the stage it covers, or a
 *   fraction of it (the school defines the stage cost; donating that stage credits that
 *   value). So donating the ₡100.000 "trabajos previos" advances `raised` by ₡100.000,
 *   exactly as if ₡100.000 had been paid. Accepting one can fulfil the project — but the
 *   board still closes it manually (reaching the goal isn't the same as it being done).
 * The per-person amount is never shown publicly (like subscriptions); only the aggregate
 * `raised` and a contributor COUNT are.
 */
export type ProjectContributionType = "money" | "in_kind";

/**
 * Project contributions are one-off (not recurring, no expiry), so unlike subscriptions
 * their lifecycle is just pending → confirmed.
 */
export type ProjectContributionStatus = "pending" | "confirmed";

/**
 * A one-off contribution to a school project (top-level collection, public read). Mirrors
 * the subscription flow: the donor creates it as `pending` and the SCHOOL confirms the
 * proof; the platform never touches the money. A Cloud Function then recomputes the
 * project's `raised`/`contributorsCount` from confirmed contributions.
 */
export interface ProjectContribution {
  schoolId: string;
  /** Denormalized for the school's confirmation queue. */
  schoolName: string;
  projectId: string;
  /** Denormalized so queues/history render without reading the project. */
  projectTitle: string;
  type: ProjectContributionType;
  /** Contributing user (uid). Contributing requires sign-in. */
  donorId: string;
  /** Denormalized account name so the board can match the proof. NOT on the public doc — it
   * lives in the `private/data` subdoc (readable by the contributor/school/admin) and is
   * merged back in client-side for the board (see getContributionsBySchool). Undefined on the
   * public doc / anonymous reads. */
  donorName?: string;
  /** Money: amount paid. In-kind: assessed value of the goods/labour. Both in `currency`
   * and both feed the progress bar once confirmed. */
  amount: number;
  /** Copied from the project so history reads standalone. */
  currency: ProjectCurrency;
  /** What is being donated, for in-kind contributions. */
  description?: string;
  /** Stage this contribution is meant to cover (index into the project's `stages`), when
   * the contributor tied it to one — mostly used by in-kind ("dono los trabajos previos").
   * Cosmetic: it helps the board assess and the UI label the aport; the progress math only
   * uses `amount`. */
  stageIndex?: number;
  /** Snapshot of the stage title at contribution time (stages can be edited later), so the
   * confirmation queue renders without reading the project. */
  stageTitle?: string;
  status: ProjectContributionStatus;
  confirmedAt: Timestamp | null;
  /** uid of the school owner/editor or admin who confirmed. */
  confirmedBy?: string;
  /** Whether a payment proof file was uploaded (file itself is private Storage, like
   * subscriptions — see project-contribution-proofs in storage.rules). */
  proofUploaded?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ProjectContributionDoc = ProjectContribution & { id: string };

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
  /** The buyer dismissed the community picker; remember it so it stays hidden across
   * visits (it can always be reopened from the quiet "Elige tu escuela" chip). */
  pickerHidden?: boolean;
  /** A stable, random per-device key (minted on first use) the accountless voter sends with a
   * pageant applause so the Cloud Function can dedup "one vote per device per pageant". NOT an
   * identity — just a localStorage handle; clearing storage resets it (acceptable: App Check is the
   * real bot wall and the sympathy axis is capped + non-binding). */
  deviceKey?: string;
  /** UX memory of which candidate this device applauded, per reinado tool (`toolId` → `candidateId`),
   * so the applause button shows "ya aplaudiste" without a server read. */
  pageantApplause?: Record<string, string>;
}
