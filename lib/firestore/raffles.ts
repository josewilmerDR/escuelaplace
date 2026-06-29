/**
 * Raffle orders (`raffleOrders/{orderId}`, top-level) — a buyer's reservation of one or more
 * numbers in a school raffle (a tool of `type: 'raffle'`). Thin typed wrappers over the shared
 * "informational order" skeleton in ./orders (the pending create + private name/amount split +
 * proof + confirm-from-pending privacy model). What is raffle-SPECIFIC and lives here: the public
 * `numbers` field on create, and `raffleNumberStates` (the number grid derives reserved/sold from
 * each order's numbers+status — derived, never stored on the tool).
 *
 * PURELY INFORMATIONAL: the platform never processes the money. The buyer pays the school directly
 * by the methods it publishes; the school confirms the proof, same as donations.
 */
import { cache } from "react";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";
import type { ProjectCurrency, RaffleOrder, RaffleOrderDoc } from "@/types";
import {
  confirmOrder,
  deleteOrder,
  getOrderProofUrl,
  getOrdersBySchool,
  getOrdersByTool,
  uploadOrderProof,
  writeOrderPrivate,
  type OrderCollection,
} from "./orders";

const RAFFLE_ORDERS: OrderCollection = {
  name: "raffleOrders",
  proofPrefix: "raffle-order-proofs",
};

/**
 * Every order of one raffle (any status), newest first. PUBLIC, anonymous-safe — used to derive
 * the number grid. Wrapped in cache() to dedupe the detail page's reads in one request.
 */
export const getRaffleOrdersByTool = cache(
  (toolId: string): Promise<RaffleOrderDoc[]> =>
    getOrdersByTool<RaffleOrder>(RAFFLE_ORDERS, toolId),
);

/** Every raffle order targeting a school (any status), newest first — the board's queue. */
export const getRaffleOrdersBySchool = cache(
  (schoolId: string): Promise<RaffleOrderDoc[]> =>
    getOrdersBySchool<RaffleOrder>(RAFFLE_ORDERS, schoolId),
);

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
 * Reserve raffle numbers in a `pending` order. Unlike the other order kinds, the PUBLIC doc is NOT
 * created on the client — the `reserveRaffleNumbers` Cloud Function arbiter creates it inside a
 * transaction so it can enforce, atomically and across orders, what the rules can't: a number lands
 * in at most one active order, and a single buyer can't hold the whole grid pending (the #N1
 * grid-lock fix). The arbiter denormalizes schoolName/toolTitle/currency from the authoritative docs
 * and forces `pending`; the client passes only the ids + the picked numbers. The buyer's real name +
 * amount then go to the private subdoc (off the public doc, never through the function). Returns the
 * new order id (for the proof upload). Throws on a taken number / per-buyer cap / unverified school.
 */
export async function createRaffleOrder(input: CreateRaffleOrderInput): Promise<string> {
  const reserve = httpsCallable<
    { schoolId: string; toolId: string; numbers: number[] },
    { orderId: string }
  >(getFirebaseFunctions(), "reserveRaffleNumbers");
  const { data } = await reserve({
    schoolId: input.schoolId,
    toolId: input.toolId,
    numbers: input.numbers,
  });
  await writeOrderPrivate(RAFFLE_ORDERS, data.orderId, {
    buyerName: input.buyerName,
    amount: input.amount,
  });
  return data.orderId;
}

export function uploadRaffleOrderProof(orderId: string, file: Blob): Promise<void> {
  return uploadOrderProof(RAFFLE_ORDERS, orderId, file);
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export function getRaffleOrderProofUrl(orderId: string): Promise<string | null> {
  return getOrderProofUrl(RAFFLE_ORDERS, orderId);
}

/** Confirm a pending order — its numbers become "sold". School/admin only (rules). */
export function confirmRaffleOrder(orderId: string, confirmedBy: string): Promise<void> {
  return confirmOrder(RAFFLE_ORDERS, orderId, confirmedBy);
}

/** Delete an order (the buyer cancels, or admin). */
export function deleteRaffleOrder(orderId: string): Promise<void> {
  return deleteOrder(RAFFLE_ORDERS, orderId);
}
