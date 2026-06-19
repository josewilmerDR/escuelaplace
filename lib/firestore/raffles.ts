/**
 * Typed reads AND writes of raffle orders (`raffleOrders/{orderId}`, top-level) — a buyer's
 * reservation of one or more numbers in a school raffle (a tool of `type: 'raffle'`). Public
 * read (the number grid needs each order's `numbers`+`status`); the buyer's real name and the
 * amount live in a PRIVATE subdoc (`raffleOrders/{id}/private/data`), and the payment proof in
 * Storage — exactly the privacy model of projectContributions.
 *
 * Top-level (not a subcollection of the tool) so the proof file and the private subdoc resolve
 * by order id alone in storage.rules/firestore.rules. The number state shown on the grid is
 * DERIVED from these orders, never stored on the tool: pending → reserved, confirmed → sold.
 *
 * PURELY INFORMATIONAL: the platform never processes the money. The buyer pays the school
 * directly by the methods it publishes; the school confirms the proof, same as donations.
 */
import { cache } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type {
  ProjectCurrency,
  RaffleOrder,
  RaffleOrderDoc,
} from "@/types";
import { snapToList } from "./converters";

const RAFFLE_ORDERS = "raffleOrders";

/** Sort by createdAt (desc) in JS to avoid a composite index (matches the other domains). */
function byCreatedAtDesc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/**
 * Every order of one raffle (any status), newest first. PUBLIC, anonymous-safe — used to
 * derive the number grid, so it does NOT merge the private fields (buyerName/amount). Wrapped
 * in cache() to dedupe the detail page's reads in one request.
 */
export const getRaffleOrdersByTool = cache(
  async (toolId: string): Promise<RaffleOrderDoc[]> => {
    const q = query(
      collection(db, RAFFLE_ORDERS),
      where("toolId", "==", toolId),
    );
    return snapToList<RaffleOrder>(await getDocs(q)).sort(byCreatedAtDesc);
  },
);

/**
 * Every raffle order targeting a school (any status, any raffle), newest first — the board's
 * confirmation queue. CLIENT-ONLY merges the private buyerName/amount back in (the board is
 * authorized to read them); on the server the merge is skipped.
 */
export const getRaffleOrdersBySchool = cache(
  async (schoolId: string): Promise<RaffleOrderDoc[]> => {
    const q = query(
      collection(db, RAFFLE_ORDERS),
      where("schoolId", "==", schoolId),
    );
    const orders = snapToList<RaffleOrder>(await getDocs(q)).sort(byCreatedAtDesc);
    return mergePrivateFields(orders);
  },
);

/**
 * Merge each order's PRIVATE fields (buyerName + amount) back onto the doc — CLIENT-ONLY and
 * best-effort (same pattern as subscriptions/contributions). Those fields live in a private
 * subdoc so an anonymous scraper can't deanonymize a buyer nor read how much they paid; the
 * board (or admin) is authorized and needs them for the confirmation queue.
 */
async function mergePrivateFields(
  orders: RaffleOrderDoc[],
): Promise<RaffleOrderDoc[]> {
  if (typeof window === "undefined") return orders; // SSR doesn't need them
  await Promise.all(
    orders.map(async (o) => {
      try {
        const data = (
          await getDoc(doc(db, RAFFLE_ORDERS, o.id, "private", "data"))
        ).data();
        if (!data) return;
        if (typeof data.buyerName === "string") o.buyerName = data.buyerName;
        if (typeof data.amount === "number") o.amount = data.amount;
      } catch {
        // Unauthorized/missing — leave as-is; authorized callers (board/admin) won't hit this.
      }
    }),
  );
  return orders;
}

/** The derived state of a single raffle number. */
export type RaffleNumberState = "available" | "reserved" | "sold";

/**
 * Derive the state of every number (0..count-1) from a raffle's orders. A confirmed order
 * SELLS its numbers; a pending order RESERVES them; everything else is available. "sold" wins
 * over "reserved" if (rarely) the same number appears in both — the school resolved the clash.
 */
export function raffleNumberStates(
  orders: Pick<RaffleOrderDoc, "numbers" | "status">[],
  count: number,
): RaffleNumberState[] {
  const states: RaffleNumberState[] = Array.from(
    { length: count },
    () => "available",
  );
  for (const o of orders) {
    const mark: RaffleNumberState | null =
      o.status === "confirmed" ? "sold" : o.status === "pending" ? "reserved" : null;
    if (!mark) continue;
    for (const n of o.numbers) {
      if (!Number.isInteger(n) || n < 0 || n >= count) continue;
      if (mark === "sold") states[n] = "sold";
      else if (states[n] === "available") states[n] = "reserved";
    }
  }
  return states;
}

// ── Buyer's name fields on the buyer's own orders are merged client-side too (history). ──
// (No buyer-history surface is built yet in this draft; the school queue is the consumer.)

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateRaffleOrderInput {
  schoolId: string;
  schoolName: string;
  toolId: string;
  toolTitle: string;
  buyerId: string;
  buyerName: string;
  /** Reserved numbers (0-based). */
  numbers: number[];
  /** numbers.length × pricePerNumber, in `currency`. */
  amount: number;
  currency: ProjectCurrency;
}

/**
 * Create a `pending` raffle order. Must be called by the signed-in buyer (rules enforce
 * buyerId == auth.uid) and only against a verified school. The buyer's real name + amount go
 * to the private subdoc (off the public doc), exactly like a project contribution. Returns the
 * new order id (for the proof upload).
 */
export async function createRaffleOrder(
  input: CreateRaffleOrderInput,
): Promise<string> {
  const created = await addDoc(collection(db, RAFFLE_ORDERS), {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    toolId: input.toolId,
    toolTitle: input.toolTitle,
    buyerId: input.buyerId,
    numbers: input.numbers,
    currency: input.currency,
    status: "pending",
    confirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, RAFFLE_ORDERS, created.id, "private", "data"), {
    buyerName: input.buyerName,
    amount: input.amount,
  });
  return created.id;
}

/** Storage path of an order's payment proof (the file never appears in the public doc). */
export function raffleOrderProofPath(orderId: string): string {
  return `raffle-order-proofs/${orderId}/proof`;
}

export async function uploadRaffleOrderProof(
  orderId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(storageRef(storage, raffleOrderProofPath(orderId)), file);
  await updateDoc(doc(db, RAFFLE_ORDERS, orderId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export async function getRaffleOrderProofUrl(
  orderId: string,
): Promise<string | null> {
  try {
    return await getDownloadURL(storageRef(storage, raffleOrderProofPath(orderId)));
  } catch {
    return null;
  }
}

/** Confirm a pending order — its numbers become "sold". School/admin only (rules). */
export async function confirmRaffleOrder(
  orderId: string,
  confirmedBy: string,
): Promise<void> {
  await updateDoc(doc(db, RAFFLE_ORDERS, orderId), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    updatedAt: serverTimestamp(),
  });
}

/** Delete an order (the buyer cancels, or admin). */
export async function deleteRaffleOrder(orderId: string): Promise<void> {
  await deleteDoc(doc(db, RAFFLE_ORDERS, orderId));
}
