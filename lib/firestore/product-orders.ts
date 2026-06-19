/**
 * Typed reads AND writes of product orders (`productOrders/{orderId}`, top-level) — a buyer's
 * order of one product from a school "Productos" catalog (a tool of `type: 'sale'`). The buyer's
 * real name and the amount live in a PRIVATE subdoc (`productOrders/{id}/private/data`), and the
 * payment proof in Storage — exactly the privacy model of raffle orders / project contributions.
 *
 * Top-level (not a subcollection of the tool) so the proof file and the private subdoc resolve
 * by order id alone in storage.rules/firestore.rules. Unlike a raffle, products are NOT limited
 * inventory, so nothing is derived back onto the public catalog from these orders — they only
 * feed the school's confirmation queue.
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
import type { ProductOrder, ProductOrderDoc, ProjectCurrency } from "@/types";
import { snapToList } from "./converters";

const PRODUCT_ORDERS = "productOrders";

/** Sort by createdAt (desc) in JS to avoid a composite index (matches the other domains). */
function byCreatedAtDesc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/**
 * Every product order targeting a school (any status, any catalog), newest first — the board's
 * confirmation queue. CLIENT-ONLY merges the private buyerName/amount back in (the board is
 * authorized to read them); on the server the merge is skipped.
 */
export const getProductOrdersBySchool = cache(
  async (schoolId: string): Promise<ProductOrderDoc[]> => {
    const q = query(
      collection(db, PRODUCT_ORDERS),
      where("schoolId", "==", schoolId),
    );
    const orders = snapToList<ProductOrder>(await getDocs(q)).sort(
      byCreatedAtDesc,
    );
    return mergePrivateFields(orders);
  },
);

/**
 * Merge each order's PRIVATE fields (buyerName + amount) back onto the doc — CLIENT-ONLY and
 * best-effort (same pattern as raffle orders / subscriptions / contributions). Those fields
 * live in a private subdoc so an anonymous scraper can't deanonymize a buyer nor read how much
 * they paid; the board (or admin) is authorized and needs them for the confirmation queue.
 */
async function mergePrivateFields(
  orders: ProductOrderDoc[],
): Promise<ProductOrderDoc[]> {
  if (typeof window === "undefined") return orders; // SSR doesn't need them
  await Promise.all(
    orders.map(async (o) => {
      try {
        const data = (
          await getDoc(doc(db, PRODUCT_ORDERS, o.id, "private", "data"))
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
 * the private subdoc (off the public doc), exactly like a raffle order. Returns the new order id
 * (for the proof upload).
 */
export async function createProductOrder(
  input: CreateProductOrderInput,
): Promise<string> {
  const created = await addDoc(collection(db, PRODUCT_ORDERS), {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    toolId: input.toolId,
    toolTitle: input.toolTitle,
    buyerId: input.buyerId,
    productId: input.productId,
    productName: input.productName,
    quantity: input.quantity,
    currency: input.currency,
    status: "pending",
    confirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, PRODUCT_ORDERS, created.id, "private", "data"), {
    buyerName: input.buyerName,
    amount: input.amount,
  });
  return created.id;
}

/** Storage path of an order's payment proof (the file never appears in the public doc). */
export function productOrderProofPath(orderId: string): string {
  return `product-order-proofs/${orderId}/proof`;
}

export async function uploadProductOrderProof(
  orderId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(storageRef(storage, productOrderProofPath(orderId)), file);
  await updateDoc(doc(db, PRODUCT_ORDERS, orderId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export async function getProductOrderProofUrl(
  orderId: string,
): Promise<string | null> {
  try {
    return await getDownloadURL(
      storageRef(storage, productOrderProofPath(orderId)),
    );
  } catch {
    return null;
  }
}

/** Confirm a pending order. School/admin only (rules). */
export async function confirmProductOrder(
  orderId: string,
  confirmedBy: string,
): Promise<void> {
  await updateDoc(doc(db, PRODUCT_ORDERS, orderId), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    updatedAt: serverTimestamp(),
  });
}

/** Delete an order (the buyer cancels, or admin). */
export async function deleteProductOrder(orderId: string): Promise<void> {
  await deleteDoc(doc(db, PRODUCT_ORDERS, orderId));
}
