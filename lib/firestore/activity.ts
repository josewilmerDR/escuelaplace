/**
 * The school's unified "Actividad" feed — one inbox that folds together every pending thing
 * the board must act on, across all six activity collections (support subscriptions, project
 * contributions, and the per-tool orders: raffles, product catalogs, bingos, reinado support).
 * Each of those already has its own typed reads; this layer NORMALIZES a pending item into a
 * common `ActivityItem` and merges them into a single oldest-first list, so the panel renders one
 * queue with type-filter chips instead of one tab per kind.
 *
 * Oldest-first on purpose: the longer something sits unconfirmed the more urgent it is (the UI's
 * PendingAge chip turns amber past SUBSCRIPTION_STALE_PENDING_DAYS), so the top of the feed is
 * always the most overdue.
 *
 * Registry-shaped by intent: when a new tool kind grows its own order collection (guided tours,
 * events…), it plugs in by adding one source here — the nav, the feed and the badge don't change.
 * PURELY INFORMATIONAL, like every queue it aggregates: the platform never touches the money; the
 * board verifies each proof and confirms, same as donations.
 */
import {
  collection,
  getDocs,
  query,
  type Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  BingoOrderDoc,
  PageantVoteDoc,
  ProductOrderDoc,
  ProjectContributionDoc,
  ProjectCurrency,
  RaffleOrderDoc,
  SubscriptionDoc,
} from "@/types";
import { getBingoOrdersBySchool } from "./bingo-orders";
import { getPageantVotesBySchool } from "./pageant";
import { getProductOrdersBySchool } from "./product-orders";
import {
  getContributionsBySchool,
  getPendingContributionsBySchool,
} from "./projects";
import { getRaffleOrdersBySchool } from "./raffles";
import {
  getPendingSubscriptionsBySchool,
  getSubscriptionsBySchool,
  supporterNameOf,
} from "./subscriptions";

/**
 * The kind of a pending item — the discriminator of `ActivityItem` and the key the UI groups
 * its filter chips by. Ordered as the feed's chips read (supports first, then the tool orders).
 */
export type ActivityKind =
  | "subscription"
  | "project_contribution"
  | "raffle_order"
  | "product_order"
  | "bingo_order"
  | "pageant_vote";

/** The kinds in chip order — the UI maps each to a Spanish label/icon. */
export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  "subscription",
  "project_contribution",
  "raffle_order",
  "product_order",
  "bingo_order",
  "pageant_vote",
] as const;

/** The fields every pending item exposes, regardless of which collection it came from. */
interface ActivityBase {
  /** Discriminator + the source doc id (unique within its own collection). */
  id: string;
  /** When the supporter/buyer created it. The feed sorts ascending on this (oldest = most
   * overdue), and the UI's PendingAge chip ages it against SUBSCRIPTION_STALE_PENDING_DAYS. */
  createdAt: Timestamp;
  /** Whether a payment proof file was uploaded — the board verifies it before confirming. */
  proofUploaded: boolean;
  /** Display name of whoever acted (business / donor / buyer), already merged from the private
   * subdoc by the underlying read. "—" when it couldn't be read (e.g. server-side). */
  who: string;
  /** Magnitude in `currency`. Undefined when the private amount couldn't be read. */
  amount?: number;
  /** Currency of `amount`. Subscriptions are implicitly CRC (`SUBSCRIPTION_UNIT_CRC`). */
  currency: ProjectCurrency;
  /** The activity this belongs to: the raffle / catalog / bingo / project title. Undefined for
   * a plain school support (a subscription targets the school itself, not a tool). */
  title?: string;
}

/**
 * One pending item in the feed: the normalized common fields PLUS the original typed doc under
 * `doc`, so a row can render its kind-specific detail (raffle numbers, ordered quantity, units,
 * stage…) and the confirm action can dispatch to the matching writer (confirmSubscription,
 * confirmRaffleOrder, …) without re-reading.
 */
export type ActivityItem =
  | (ActivityBase & { kind: "subscription"; doc: SubscriptionDoc })
  | (ActivityBase & { kind: "project_contribution"; doc: ProjectContributionDoc })
  | (ActivityBase & { kind: "raffle_order"; doc: RaffleOrderDoc })
  | (ActivityBase & { kind: "product_order"; doc: ProductOrderDoc })
  | (ActivityBase & { kind: "bingo_order"; doc: BingoOrderDoc })
  | (ActivityBase & { kind: "pageant_vote"; doc: PageantVoteDoc });

/** Oldest first — a stale pending item is the most urgent. Missing timestamps sort last. */
function byAgeAsc(a: ActivityItem, b: ActivityItem): number {
  return (a.createdAt?.toMillis?.() ?? Infinity) - (b.createdAt?.toMillis?.() ?? Infinity);
}

/** Newest first — history reads most-recent-first. Missing timestamps sort last. */
function byAgeDesc(a: ActivityItem, b: ActivityItem): number {
  return (b.createdAt?.toMillis?.() ?? -Infinity) - (a.createdAt?.toMillis?.() ?? -Infinity);
}

// ── Per-kind normalizers (pure) ──────────────────────────────────────────────

function fromSubscription(doc: SubscriptionDoc): ActivityItem {
  return {
    kind: "subscription",
    id: doc.id,
    createdAt: doc.createdAt,
    proofUploaded: doc.proofUploaded ?? false,
    who: supporterNameOf(doc),
    amount: doc.amount,
    currency: "CRC",
    doc,
  };
}

function fromContribution(doc: ProjectContributionDoc): ActivityItem {
  return {
    kind: "project_contribution",
    id: doc.id,
    createdAt: doc.createdAt,
    proofUploaded: doc.proofUploaded ?? false,
    who: doc.donorName ?? "—",
    amount: doc.amount,
    currency: doc.currency,
    title: doc.projectTitle,
    doc,
  };
}

function fromRaffleOrder(doc: RaffleOrderDoc): ActivityItem {
  return {
    kind: "raffle_order",
    id: doc.id,
    createdAt: doc.createdAt,
    proofUploaded: doc.proofUploaded ?? false,
    who: doc.buyerName ?? "—",
    amount: doc.amount,
    currency: doc.currency,
    title: doc.toolTitle,
    doc,
  };
}

function fromProductOrder(doc: ProductOrderDoc): ActivityItem {
  return {
    kind: "product_order",
    id: doc.id,
    createdAt: doc.createdAt,
    proofUploaded: doc.proofUploaded ?? false,
    who: doc.buyerName ?? "—",
    amount: doc.amount,
    currency: doc.currency,
    title: doc.toolTitle,
    doc,
  };
}

function fromBingoOrder(doc: BingoOrderDoc): ActivityItem {
  return {
    kind: "bingo_order",
    id: doc.id,
    createdAt: doc.createdAt,
    proofUploaded: doc.proofUploaded ?? false,
    who: doc.buyerName ?? "—",
    amount: doc.amount,
    currency: doc.currency,
    title: doc.toolTitle,
    doc,
  };
}

function fromPageantVote(doc: PageantVoteDoc): ActivityItem {
  return {
    kind: "pageant_vote",
    id: doc.id,
    createdAt: doc.createdAt,
    proofUploaded: doc.proofUploaded ?? false,
    who: doc.buyerName ?? "—",
    amount: doc.amount,
    currency: doc.currency,
    title: doc.toolTitle,
    doc,
  };
}

/** All six source lists, already fetched and filtered to the statuses the caller wants. */
interface ActivitySources {
  subscriptions: SubscriptionDoc[];
  contributions: ProjectContributionDoc[];
  raffleOrders: RaffleOrderDoc[];
  productOrders: ProductOrderDoc[];
  bingoOrders: BingoOrderDoc[];
  pageantVotes: PageantVoteDoc[];
}

/** Normalize every source doc to an ActivityItem (unsorted). The kind-specific mapping lives in
 * the from* helpers; ordering is the caller's (pending = oldest-first, history = newest-first). */
function normalizeSources(sources: ActivitySources): ActivityItem[] {
  return [
    ...sources.subscriptions.map(fromSubscription),
    ...sources.contributions.map(fromContribution),
    ...sources.raffleOrders.map(fromRaffleOrder),
    ...sources.productOrders.map(fromProductOrder),
    ...sources.bingoOrders.map(fromBingoOrder),
    ...sources.pageantVotes.map(fromPageantVote),
  ];
}

/**
 * Fold already-fetched pending lists into one normalized, oldest-first feed. PURE — the Firestore
 * I/O lives in getPendingActivityBySchool; this is the piece the test pins (every kind present,
 * ordering, field mapping). Callers pass pending-only lists; this does not re-filter by status.
 */
export function mergePendingActivity(sources: ActivitySources): ActivityItem[] {
  return normalizeSources(sources).sort(byAgeAsc);
}

// ── Aggregated reads ─────────────────────────────────────────────────────────

const PROJECT_CONTRIBUTIONS = "projectContributions";
const RAFFLE_ORDERS = "raffleOrders";
const PRODUCT_ORDERS = "productOrders";
const BINGO_ORDERS = "bingoOrders";
const PAGEANT_VOTES = "pageantVotes";

/**
 * The school's whole pending queue, normalized and oldest-first. Runs the six source reads in
 * parallel and folds them with mergePendingActivity. The per-tool reads (raffle/product/bingo/
 * pageant) have no server-side status filter — they fetch by school and we keep the `pending` ones
 * in JS, matching the rest of the MVP (only `subscriptions` carries the composite (schoolId, status)
 * index). Each underlying read merges the buyer/donor name + amount from the private subdoc
 * client-side, so the feed renders the board's view with no extra work here.
 *
 * CLIENT-ONLY in practice: the private-field merges and the magnitudes only resolve for the
 * authorized board (see each domain's mergePrivateFields). The school's confirmation panel is a
 * client component, which is the intended caller.
 */
export async function getPendingActivityBySchool(
  schoolId: string,
): Promise<ActivityItem[]> {
  const [
    subscriptions,
    contributions,
    raffleOrders,
    productOrders,
    bingoOrders,
    pageantVotes,
  ] = await Promise.all([
    // getSubscriptionsBySchool (not the count's pending-only read) so donor names are merged.
    getSubscriptionsBySchool(schoolId).then((subs) =>
      subs.filter((s) => s.status === "pending"),
    ),
    getPendingContributionsBySchool(schoolId),
    getRaffleOrdersBySchool(schoolId).then((os) =>
      os.filter((o) => o.status === "pending"),
    ),
    getProductOrdersBySchool(schoolId).then((os) =>
      os.filter((o) => o.status === "pending"),
    ),
    getBingoOrdersBySchool(schoolId).then((os) =>
      os.filter((o) => o.status === "pending"),
    ),
    getPageantVotesBySchool(schoolId).then((os) =>
      os.filter((o) => o.status === "pending"),
    ),
  ]);
  return mergePendingActivity({
    subscriptions,
    contributions,
    raffleOrders,
    productOrders,
    bingoOrders,
    pageantVotes,
  });
}

/**
 * The school's settled history — everything that's no longer pending (confirmed orders/aportes,
 * plus expiring/expired subscriptions), normalized and NEWEST-first. The "Ver historial" toggle
 * of the Actividad inbox loads this on demand. Same six sources as the pending feed, filtered to
 * `status !== "pending"`; each underlying read merges the buyer/donor name + amount client-side.
 */
export async function getActivityHistoryBySchool(
  schoolId: string,
): Promise<ActivityItem[]> {
  const [
    subscriptions,
    contributions,
    raffleOrders,
    productOrders,
    bingoOrders,
    pageantVotes,
  ] = await Promise.all([
    getSubscriptionsBySchool(schoolId).then((l) =>
      l.filter((s) => s.status !== "pending"),
    ),
    getContributionsBySchool(schoolId).then((l) =>
      l.filter((c) => c.status !== "pending"),
    ),
    getRaffleOrdersBySchool(schoolId).then((l) =>
      l.filter((o) => o.status !== "pending"),
    ),
    getProductOrdersBySchool(schoolId).then((l) =>
      l.filter((o) => o.status !== "pending"),
    ),
    getBingoOrdersBySchool(schoolId).then((l) =>
      l.filter((o) => o.status !== "pending"),
    ),
    getPageantVotesBySchool(schoolId).then((l) =>
      l.filter((o) => o.status !== "pending"),
    ),
  ]);
  return normalizeSources({
    subscriptions,
    contributions,
    raffleOrders,
    productOrders,
    bingoOrders,
    pageantVotes,
  }).sort(byAgeDesc);
}

/** Count pending docs in a top-level order/contribution collection — bare schoolId read, status
 * filtered in JS, NO private-subdoc merge (a count needs no names/amounts). Zero new indexes. */
async function countPendingInCollection(
  collectionName: string,
  schoolId: string,
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, collectionName), where("schoolId", "==", schoolId)),
  );
  let pending = 0;
  snap.forEach((d) => {
    if (d.get("status") === "pending") pending += 1;
  });
  return pending;
}

/**
 * Total number of pending items across all six collections — the badge on the "Actividad" tab,
 * the panel card and the public manage strip. Deliberately lean: it skips the private-field
 * merges the feed does (a badge needs only the number), and subscriptions use their indexed
 * pending read. Reads scale with the school's order volume, not the platform's; if that grows,
 * the next step is a denormalized counter maintained by a Cloud Function (decision #5), which
 * this signature already hides from callers.
 */
export async function getPendingActivityCountBySchool(
  schoolId: string,
): Promise<number> {
  const counts = await Promise.all([
    getPendingSubscriptionsBySchool(schoolId).then((l) => l.length),
    countPendingInCollection(PROJECT_CONTRIBUTIONS, schoolId),
    countPendingInCollection(RAFFLE_ORDERS, schoolId),
    countPendingInCollection(PRODUCT_ORDERS, schoolId),
    countPendingInCollection(BINGO_ORDERS, schoolId),
    countPendingInCollection(PAGEANT_VOTES, schoolId),
  ]);
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Sum of the pending counts across several schools — the global "Actividad" roll-up a user who
 * manages more than one school sees in the account menu / panel sidebar. Counts run in parallel;
 * an empty list short-circuits to 0 (no reads).
 */
export async function getPendingActivityCountForSchools(
  schoolIds: string[],
): Promise<number> {
  if (schoolIds.length === 0) return 0;
  const counts = await Promise.all(
    schoolIds.map((id) => getPendingActivityCountBySchool(id)),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}
