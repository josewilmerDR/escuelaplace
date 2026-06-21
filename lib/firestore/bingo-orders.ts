/**
 * Bingo orders (`bingoOrders/{orderId}`, top-level) — a buyer's reservation of N cartones in a
 * school bingo (a tool of `type: 'bingo'`). Thin typed wrappers over the shared "informational
 * order" skeleton in ./orders (the pending create + private name/amount split + proof +
 * confirm-from-pending privacy model). What is bingo-SPECIFIC and lives here: the public `quantity`
 * field on create, and `confirmBingoOrder` — the one piece of genuinely new logic, a BATCHED
 * card-assignment write (the buyer reserves a quantity; the school assigns that many available
 * cartones on confirmation), which is why bingo can't use the shared confirmOrder.
 *
 * PURELY INFORMATIONAL: the platform never processes the money. The buyer pays the school directly;
 * the school confirms the proof, same as donations.
 */
import { cache } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BingoOrder, BingoOrderDoc, ProjectCurrency } from "@/types";
import {
  createOrder,
  deleteOrder,
  getOrderProofUrl,
  getOrdersBySchool,
  getOrdersByTool,
  orderProofPath,
  uploadOrderProof,
  type OrderCollection,
} from "./orders";

const BINGO_ORDERS: OrderCollection = {
  name: "bingoOrders",
  proofPrefix: "bingo-order-proofs",
};
const SCHOOLS = "schools";
const TOOLS = "tools";
const CARDS = "cards";

/**
 * Every order of one bingo (any status), newest first. PUBLIC, anonymous-safe — used to derive how
 * many cartones are still available. Wrapped in cache() to dedupe the detail page's reads.
 */
export const getBingoOrdersByTool = cache(
  (toolId: string): Promise<BingoOrderDoc[]> =>
    getOrdersByTool<BingoOrder>(BINGO_ORDERS, toolId),
);

/** Every bingo order targeting a school (any status), newest first — the board's queue. */
export const getBingoOrdersBySchool = cache(
  (schoolId: string): Promise<BingoOrderDoc[]> =>
    getOrdersBySchool<BingoOrder>(BINGO_ORDERS, schoolId),
);

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateBingoOrderInput {
  schoolId: string;
  schoolName: string;
  toolId: string;
  toolTitle: string;
  buyerId: string;
  buyerName: string;
  /** Cartones requested (integer ≥ 1). */
  quantity: number;
  /** quantity × pricePerCard, in `currency`. */
  amount: number;
  currency: ProjectCurrency;
}

/**
 * Create a `pending` bingo order. Must be called by the signed-in buyer (rules enforce
 * buyerId == auth.uid) and only against a verified school. The buyer's real name + amount go to
 * the private subdoc (off the public doc). Returns the new order id (for the proof upload).
 */
export function createBingoOrder(input: CreateBingoOrderInput): Promise<string> {
  return createOrder(
    BINGO_ORDERS,
    {
      schoolId: input.schoolId,
      schoolName: input.schoolName,
      toolId: input.toolId,
      toolTitle: input.toolTitle,
      buyerId: input.buyerId,
      quantity: input.quantity,
      currency: input.currency,
    },
    { buyerName: input.buyerName, amount: input.amount },
  );
}

/** Storage path of an order's payment proof (the file never appears in the public doc). */
export function bingoOrderProofPath(orderId: string): string {
  return orderProofPath(BINGO_ORDERS, orderId);
}

export function uploadBingoOrderProof(orderId: string, file: Blob): Promise<void> {
  return uploadOrderProof(BINGO_ORDERS, orderId, file);
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export function getBingoOrderProofUrl(orderId: string): Promise<string | null> {
  return getOrderProofUrl(BINGO_ORDERS, orderId);
}

/**
 * Confirm a pending order AND assign cartones to the buyer, atomically. The school (which owns
 * both the cards and the order) reads the available cartones, takes the first `quantity` (lowest
 * labels first), marks them sold/owned, and flips the order to confirmed with their ids — all in
 * one batch. Throws (no write) if fewer cartones are available than requested, so the board can
 * generate more or adjust instead of overselling. Bingo's bespoke confirm (the shared confirmOrder
 * only flips status); the order's money invariants still live in ./orders + firestore.rules.
 */
export async function confirmBingoOrder(
  order: Pick<BingoOrderDoc, "id" | "schoolId" | "toolId" | "buyerId" | "quantity">,
  confirmedBy: string,
): Promise<void> {
  const availableSnap = await getDocs(
    query(
      collection(db, SCHOOLS, order.schoolId, TOOLS, order.toolId, CARDS),
      where("status", "==", "available"),
    ),
  );
  if (availableSnap.size < order.quantity) {
    throw new Error(
      `Solo hay ${availableSnap.size} cartones disponibles y el pedido pide ${order.quantity}. ` +
        "Generá más cartones o ajustá el pedido.",
    );
  }
  const chosen = [...availableSnap.docs]
    .sort((a, b) =>
      String(a.data().label).localeCompare(String(b.data().label), undefined, {
        numeric: true,
      }),
    )
    .slice(0, order.quantity);

  const batch = writeBatch(db);
  const cardIds: string[] = [];
  for (const card of chosen) {
    batch.update(card.ref, {
      status: "sold",
      soldOrderId: order.id,
      ownerId: order.buyerId,
    });
    cardIds.push(card.id);
  }
  batch.update(doc(db, BINGO_ORDERS.name, order.id), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    cardIds,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** Delete an order (the buyer cancels, or admin). */
export function deleteBingoOrder(orderId: string): Promise<void> {
  return deleteOrder(BINGO_ORDERS, orderId);
}
