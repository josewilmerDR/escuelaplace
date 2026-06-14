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
  type: "subscription_confirmed" | "project_contribution_confirmed";
  /** Source doc id of a subscription confirmation. */
  subscriptionId?: string;
  /** Source doc id of a project-contribution confirmation. */
  contributionId?: string;
  /** Project funded (project_contribution_confirmed only). */
  projectId?: string;
  /** Denormalized project title (project_contribution_confirmed only). */
  projectTitle?: string;
  /** Money vs in-kind (project_contribution_confirmed only). */
  contributionType?: ProjectContributionType;
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
  /** Support magnitude (integer n in n × SUBSCRIPTION_UNIT_CRC; subscriptions only) — a
   * COUNT, never a money figure. Absent on project contributions (no units). */
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
export const PROJECT_STAGE_PHOTO_MAX = 4;
export const PROJECT_STAGE_QUOTE_MAX = 3;

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
 * cost and may attach photos (e.g. the terrain today + a projection of the result) and
 * quotes (cotizaciones) for transparency — the same evidence the verification mechanic
 * already rewards. The project goal is the SUM of the stage costs (computed, never stored).
 */
export interface ProjectStage {
  title: string;
  /** Why this stage exists and why it costs what it costs. */
  justification: string;
  /** Cost in the project's `currency`. */
  cost: number;
  /** Public Storage URLs (schools/{id}/projects/{pid}/...). */
  photos?: string[];
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
  /** Denormalized account name so the board can match the proof. Not public. */
  donorName: string;
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
   * visits (it can always be reopened from the quiet "Elegí tu escuela" chip). */
  pickerHidden?: boolean;
}
