/**
 * Typed reads + writes of bingo orders (`bingoOrders/{orderId}`, top-level) — a buyer's
 * reservation of N cartones in a school bingo (a tool of `type: 'bingo'`). Mirrors raffle orders:
 * public read, the buyer's real name + amount live in a PRIVATE subdoc
 * (`bingoOrders/{id}/private/data`), and the payment proof in Storage. Top-level (not nested) so
 * the proof file and private subdoc resolve by order id alone.
 *
 * Unlike a raffle (where the buyer picks specific numbers), a bingo buyer reserves a QUANTITY;
 * the school ASSIGNS that many available cartones when it confirms the payment — see
 * confirmBingoOrder, the one piece of genuinely new logic (a batched card-assignment write).
 *
 * PURELY INFORMATIONAL: the platform never processes the money. The buyer pays the school
 * directly; the school confirms the proof, same as donations.
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
  writeBatch,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type { BingoOrder, BingoOrderDoc, ProjectCurrency } from "@/types";
import { snapToList } from "./converters";

const BINGO_ORDERS = "bingoOrders";
const SCHOOLS = "schools";
const TOOLS = "tools";
const CARDS = "cards";

/** Sort by createdAt (desc) in JS to avoid a composite index (matches the other domains). */
function byCreatedAtDesc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/**
 * Every order of one bingo (any status), newest first. PUBLIC, anonymous-safe — used to derive
 * how many cartones are still available, so it does NOT merge the private fields. Wrapped in
 * cache() to dedupe the detail page's reads in one request.
 */
export const getBingoOrdersByTool = cache(
  async (toolId: string): Promise<BingoOrderDoc[]> => {
    const q = query(collection(db, BINGO_ORDERS), where("toolId", "==", toolId));
    return snapToList<BingoOrder>(await getDocs(q)).sort(byCreatedAtDesc);
  },
);

/**
 * Every bingo order targeting a school (any status, any bingo), newest first — the board's
 * confirmation queue. CLIENT-ONLY merges the private buyerName/amount back in (the board is
 * authorized); on the server the merge is skipped.
 */
export const getBingoOrdersBySchool = cache(
  async (schoolId: string): Promise<BingoOrderDoc[]> => {
    const q = query(
      collection(db, BINGO_ORDERS),
      where("schoolId", "==", schoolId),
    );
    const orders = snapToList<BingoOrder>(await getDocs(q)).sort(byCreatedAtDesc);
    return mergePrivateFields(orders);
  },
);

/**
 * Merge each order's PRIVATE fields (buyerName + amount) back onto the doc — CLIENT-ONLY and
 * best-effort, the same pattern as raffle orders. Those fields live in a private subdoc so an
 * anonymous scraper can't deanonymize a buyer nor read how much they paid.
 */
async function mergePrivateFields(
  orders: BingoOrderDoc[],
): Promise<BingoOrderDoc[]> {
  if (typeof window === "undefined") return orders; // SSR doesn't need them
  await Promise.all(
    orders.map(async (o) => {
      try {
        const data = (
          await getDoc(doc(db, BINGO_ORDERS, o.id, "private", "data"))
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
export async function createBingoOrder(
  input: CreateBingoOrderInput,
): Promise<string> {
  const created = await addDoc(collection(db, BINGO_ORDERS), {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    toolId: input.toolId,
    toolTitle: input.toolTitle,
    buyerId: input.buyerId,
    quantity: input.quantity,
    currency: input.currency,
    status: "pending",
    confirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, BINGO_ORDERS, created.id, "private", "data"), {
    buyerName: input.buyerName,
    amount: input.amount,
  });
  return created.id;
}

/** Storage path of an order's payment proof (the file never appears in the public doc). */
export function bingoOrderProofPath(orderId: string): string {
  return `bingo-order-proofs/${orderId}/proof`;
}

export async function uploadBingoOrderProof(
  orderId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(storageRef(storage, bingoOrderProofPath(orderId)), file);
  await updateDoc(doc(db, BINGO_ORDERS, orderId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export async function getBingoOrderProofUrl(
  orderId: string,
): Promise<string | null> {
  try {
    return await getDownloadURL(
      storageRef(storage, bingoOrderProofPath(orderId)),
    );
  } catch {
    return null;
  }
}

/**
 * Confirm a pending order AND assign cartones to the buyer, atomically. The school (which owns
 * both the cards and the order) reads the available cartones, takes the first `quantity` (lowest
 * labels first), marks them sold/owned, and flips the order to confirmed with their ids — all in
 * one batch. Throws (no write) if fewer cartones are available than requested, so the board can
 * generate more or adjust instead of overselling.
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
  batch.update(doc(db, BINGO_ORDERS, order.id), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    cardIds,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** Delete an order (the buyer cancels, or admin). */
export async function deleteBingoOrder(orderId: string): Promise<void> {
  await deleteDoc(doc(db, BINGO_ORDERS, orderId));
}
