/**
 * Product orders (`productOrders/{orderId}`, top-level) — a buyer's order of one product from a
 * school "Productos" catalog (a tool of `type: 'sale'`). Thin typed wrappers over the shared
 * "informational order" skeleton in ./orders (the pending create + private name/amount split +
 * proof + confirm-from-pending privacy model). What is sale-SPECIFIC and lives here: the public
 * productId/productName/quantity fields on create. Unlike a raffle, products are NOT limited
 * inventory, so nothing is derived back onto the catalog — orders only feed the school's queue.
 *
 * PURELY INFORMATIONAL: the platform never processes the money. The buyer pays the school directly
 * by the methods it publishes; the school confirms the proof, same as donations.
 */
import { cache } from "react";
import type { ProductOrder, ProductOrderDoc, ProjectCurrency } from "@/types";
import {
  confirmOrder,
  createOrder,
  deleteOrder,
  getOrderProofUrl,
  getOrdersBySchool,
  orderProofPath,
  uploadOrderProof,
  type OrderCollection,
} from "./orders";

const PRODUCT_ORDERS: OrderCollection = {
  name: "productOrders",
  proofPrefix: "product-order-proofs",
};

/** Every product order targeting a school (any status), newest first — the board's queue. */
export const getProductOrdersBySchool = cache(
  (schoolId: string): Promise<ProductOrderDoc[]> =>
    getOrdersBySchool<ProductOrder>(PRODUCT_ORDERS, schoolId),
);

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateProductOrderInput {
  schoolId: string;
  schoolName: string;
  toolId: string;
  toolTitle: string;
  buyerId: string;
  buyerName: string;
  /** Which product (SaleProduct.id) + a name snapshot for the queue. */
  productId: string;
  productName: string;
  quantity: number;
  /** quantity × unit price, in `currency`. */
  amount: number;
  currency: ProjectCurrency;
}

/**
 * Create a `pending` product order. Must be called by the signed-in buyer (rules enforce
 * buyerId == auth.uid) and only against a verified school. The buyer's real name + amount go to
 * the private subdoc (off the public doc). Returns the new order id (for the proof upload).
 */
export function createProductOrder(input: CreateProductOrderInput): Promise<string> {
  return createOrder(
    PRODUCT_ORDERS,
    {
      schoolId: input.schoolId,
      schoolName: input.schoolName,
      toolId: input.toolId,
      toolTitle: input.toolTitle,
      buyerId: input.buyerId,
      productId: input.productId,
      productName: input.productName,
      quantity: input.quantity,
      currency: input.currency,
    },
    { buyerName: input.buyerName, amount: input.amount },
  );
}

/** Storage path of an order's payment proof (the file never appears in the public doc). */
export function productOrderProofPath(orderId: string): string {
  return orderProofPath(PRODUCT_ORDERS, orderId);
}

export function uploadProductOrderProof(orderId: string, file: Blob): Promise<void> {
  return uploadOrderProof(PRODUCT_ORDERS, orderId, file);
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export function getProductOrderProofUrl(orderId: string): Promise<string | null> {
  return getOrderProofUrl(PRODUCT_ORDERS, orderId);
}

/** Confirm a pending order. School/admin only (rules). */
export function confirmProductOrder(orderId: string, confirmedBy: string): Promise<void> {
  return confirmOrder(PRODUCT_ORDERS, orderId, confirmedBy);
}

/** Delete an order (the buyer cancels, or admin). */
export function deleteProductOrder(orderId: string): Promise<void> {
  return deleteOrder(PRODUCT_ORDERS, orderId);
}
