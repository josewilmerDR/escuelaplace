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
import type { ProjectCurrency, RaffleOrder, RaffleOrderDoc } from "@/types";
import {
  confirmOrder,
  createOrder,
  deleteOrder,
  getOrderProofUrl,
  getOrdersBySchool,
  getOrdersByTool,
  uploadOrderProof,
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
 * Create a `pending` raffle order. Must be called by the signed-in buyer (rules enforce
 * buyerId == auth.uid) and only against a verified school. The buyer's real name + amount go to
 * the private subdoc (off the public doc). Returns the new order id (for the proof upload).
 */
export function createRaffleOrder(input: CreateRaffleOrderInput): Promise<string> {
  return createOrder(
    RAFFLE_ORDERS,
    {
      schoolId: input.schoolId,
      schoolName: input.schoolName,
      toolId: input.toolId,
      toolTitle: input.toolTitle,
      buyerId: input.buyerId,
      numbers: input.numbers,
      currency: input.currency,
    },
    { buyerName: input.buyerName, amount: input.amount },
  );
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
