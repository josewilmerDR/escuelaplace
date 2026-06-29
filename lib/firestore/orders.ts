/**
 * Shared "informational order" skeleton for the buyable tool kinds (raffle / sale / bingo).
 *
 * Every such order is the SAME privacy + anti-fraud model as projectContributions: a top-level
 * `*Orders/{id}` document that is PUBLIC-readable and carries NO money — the buyer's real name and
 * the amount live in a PRIVATE subdoc (`*Orders/{id}/private/data`) and the payment proof in
 * Storage. The order is created `pending`; only the target school confirms it. The platform NEVER
 * processes money — the buyer pays the school directly by the methods it publishes.
 *
 * This module holds that model in ONE place so a new buyable kind clones nothing security-relevant.
 * A per-kind file (raffles.ts / product-orders.ts / bingo-orders.ts) supplies only:
 *   - its `OrderCollection` (the Firestore collection name + the Storage proof prefix), and
 *   - its kind-specific PUBLIC fields when creating (numbers / productId+quantity / quantity),
 * then re-exports thin typed wrappers around these generics. The money-boundary invariants —
 * forced `pending`, the private name/amount split, the proof-only-flag on the public doc — are
 * therefore written once here and mirrored by firestore.rules (valid*OrderCreate) + storage.rules.
 */
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
import { byCreatedAtDesc, snapToList } from "./converters";

/** Identifies one buyable kind's order storage: its Firestore collection + Storage proof prefix. */
export interface OrderCollection {
  /** Top-level Firestore collection, e.g. "raffleOrders". */
  name: string;
  /** Storage proof path prefix, e.g. "raffle-order-proofs". */
  proofPrefix: string;
}

/** The fields that live OFF the public doc, in `*Orders/{id}/private/data`. */
export interface OrderPrivateFields {
  /** The buyer's real (proof-matching) name — never on the public doc. */
  buyerName: string;
  /** What the buyer paid — never on the public doc, never aggregated by the platform. */
  amount: number;
}

/**
 * Every order of one tool (any status), newest first. PUBLIC, anonymous-safe — used to derive
 * limited-inventory state (raffle numbers / bingo cartones), so it does NOT merge the private
 * fields. Callers wrap this in React cache() to dedupe a request's reads.
 */
export async function getOrdersByTool<
  T extends { createdAt?: { toMillis?: () => number } },
>(col: OrderCollection, toolId: string): Promise<(T & { id: string })[]> {
  const q = query(collection(db, col.name), where("toolId", "==", toolId));
  return snapToList<T>(await getDocs(q)).sort(byCreatedAtDesc);
}

/**
 * Every order targeting a school (any status), newest first — the board's confirmation queue.
 * CLIENT-ONLY merges the private buyerName/amount back in (the board is authorized to read them);
 * on the server the merge is skipped.
 */
export async function getOrdersBySchool<
  T extends {
    createdAt?: { toMillis?: () => number };
    buyerName?: string;
    amount?: number;
  },
>(col: OrderCollection, schoolId: string): Promise<(T & { id: string })[]> {
  const q = query(collection(db, col.name), where("schoolId", "==", schoolId));
  const orders = snapToList<T>(await getDocs(q)).sort(byCreatedAtDesc);
  return mergeOrderPrivateFields(col, orders);
}

/**
 * Merge each order's PRIVATE fields (buyerName + amount) back onto the doc — CLIENT-ONLY and
 * best-effort (the same pattern as subscriptions/contributions). Those fields live in a private
 * subdoc so an anonymous scraper can't deanonymize a buyer nor read how much they paid; the board
 * (or admin) is authorized and needs them for the confirmation queue.
 */
async function mergeOrderPrivateFields<
  T extends { id: string; buyerName?: string; amount?: number },
>(col: OrderCollection, orders: T[]): Promise<T[]> {
  if (typeof window === "undefined") return orders; // SSR doesn't need them
  await Promise.all(
    orders.map(async (o) => {
      try {
        const data = (
          await getDoc(doc(db, col.name, o.id, "private", "data"))
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

/**
 * Create a `pending` order. Must be called by the signed-in buyer (rules enforce buyerId ==
 * auth.uid) and only against a verified school. `publicFields` carries the kind's public, NON-money
 * fields (schoolId/schoolName/toolId/toolTitle/buyerId/currency + e.g. numbers/quantity); the
 * buyer's real name + amount are written to the private subdoc, OFF the public doc. The forced
 * `status: 'pending'` / `confirmedAt: null` and the private split are the money-boundary invariants,
 * kept here so every kind shares them. Returns the new order id (for the proof upload).
 */
export async function createOrder(
  col: OrderCollection,
  publicFields: Record<string, unknown>,
  priv: OrderPrivateFields,
): Promise<string> {
  const created = await addDoc(collection(db, col.name), {
    ...publicFields,
    status: "pending",
    confirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await writeOrderPrivate(col, created.id, priv);
  return created.id;
}

/**
 * Write an order's PRIVATE subdoc (buyerName + amount), OFF the public doc. Split out of
 * createOrder because the raffle kind no longer creates its public doc on the client — a Cloud
 * Function arbiter (reserveRaffleNumbers) does, to enforce number uniqueness + a per-buyer cap the
 * rules can't — so the client writes only this private half afterward. Rules let the buyer create
 * it on their own pending order.
 */
export async function writeOrderPrivate(
  col: OrderCollection,
  orderId: string,
  priv: OrderPrivateFields,
): Promise<void> {
  await setDoc(doc(db, col.name, orderId, "private", "data"), {
    buyerName: priv.buyerName,
    amount: priv.amount,
  });
}

/** Storage path of an order's payment proof (the file never appears in the public doc). */
export function orderProofPath(col: OrderCollection, orderId: string): string {
  return `${col.proofPrefix}/${orderId}/proof`;
}

/** Upload a payment proof and flip the public `proofUploaded` flag (the file stays private). */
export async function uploadOrderProof(
  col: OrderCollection,
  orderId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(storageRef(storage, orderProofPath(col, orderId)), file);
  await updateDoc(doc(db, col.name, orderId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export async function getOrderProofUrl(
  col: OrderCollection,
  orderId: string,
): Promise<string | null> {
  try {
    return await getDownloadURL(storageRef(storage, orderProofPath(col, orderId)));
  } catch {
    return null;
  }
}

/**
 * Confirm a pending order. School/admin only (rules). The simple confirm — a kind whose
 * confirmation does extra bookkeeping (bingo assigns cartones) writes its own batched confirm.
 */
export async function confirmOrder(
  col: OrderCollection,
  orderId: string,
  confirmedBy: string,
): Promise<void> {
  await updateDoc(doc(db, col.name, orderId), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    updatedAt: serverTimestamp(),
  });
}

/** Delete an order (the buyer cancels, or admin). */
export async function deleteOrder(
  col: OrderCollection,
  orderId: string,
): Promise<void> {
  await deleteDoc(doc(db, col.name, orderId));
}
