/**
 * Raffle reservation arbiter (Gen 2 callable, Admin SDK) — the sole creator of `raffleOrders`.
 *
 * Closes the raffle grid-lock DoS (#N1): firestore.rules deny direct client creates of
 * raffleOrders, so every reservation comes through here. The work the rules cannot do — guarantee
 * a number is in at most one active order, and cap how much of the grid a single buyer can hold
 * pending — runs in a TRANSACTION that reads every active order for the raffle, validates (see
 * ./raffle-logic), and writes the new `pending` order atomically. Two concurrent reservations for
 * the same number race on the transaction's read set; Firestore aborts and retries one, which then
 * sees the other's order and rejects the clash. The platform still NEVER touches money — the buyer's
 * name + amount go to the private subdoc the client writes next, and the school confirms the proof.
 *
 * Auth is required (the order's buyerId is the caller's uid, never client-supplied). App Check is
 * NOT enforced here — it stays dormant platform-wide until go-live (see docs/pageant-free-vote-
 * golive.md); the per-buyer cap + the sign-in requirement are the anti-flood until then.
 *
 * DEPLOY ORDER: ship this function BEFORE the rules that deny client creates, or raffle buying
 * breaks in the gap (the client would have no create path). See docs/security/SECURITY-BASELINE.md.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  RAFFLE_NUMBER_COUNT,
  raffleReservationError,
  type ReservationError,
} from "./raffle-logic";

const SCHOOLS = "schools";
const TOOLS = "tools";
const RAFFLE_ORDERS = "raffleOrders";
/** Firestore document ids: auto-ids are alphanumeric; allow the usual id charset, bounded. */
const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

/** Map the pure validator's typed error onto the matching callable error code. */
function toHttpsError(err: ReservationError): HttpsError {
  if (err.code === "taken") {
    return new HttpsError("failed-precondition", err.message, { taken: err.taken });
  }
  if (err.code === "buyer-cap") {
    return new HttpsError("resource-exhausted", err.message);
  }
  return new HttpsError("invalid-argument", err.message);
}

export const reserveRaffleNumbers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Inicia sesión para apartar números.");
  }
  const buyerId = request.auth.uid;

  const data = request.data as
    | { schoolId?: unknown; toolId?: unknown; numbers?: unknown }
    | null
    | undefined;
  const schoolId = typeof data?.schoolId === "string" ? data.schoolId : "";
  const toolId = typeof data?.toolId === "string" ? data.toolId : "";
  if (!ID_RE.test(schoolId) || !ID_RE.test(toolId)) {
    throw new HttpsError("invalid-argument", "Rifa inválida.");
  }
  // Strict parse: any non-integer entry is a bad payload, not silently dropped.
  if (!Array.isArray(data?.numbers) || data.numbers.some((n) => !Number.isInteger(n))) {
    throw new HttpsError("invalid-argument", "Números inválidos.");
  }
  const numbers = data.numbers as number[];

  const db = getFirestore();
  const orderId = await db.runTransaction(async (tx) => {
    const schoolRef = db.collection(SCHOOLS).doc(schoolId);
    const toolRef = schoolRef.collection(TOOLS).doc(toolId);
    // Every order of this raffle (any status) — the active ones derive the reserved set. A single
    // raffle's order count is bounded by the grid, so this read stays small.
    const ordersQuery = db.collection(RAFFLE_ORDERS).where("toolId", "==", toolId);

    // Transaction reads must precede writes.
    const [schoolSnap, toolSnap, ordersSnap] = await Promise.all([
      tx.get(schoolRef),
      tx.get(toolRef),
      tx.get(ordersQuery),
    ]);

    if (!schoolSnap.exists || schoolSnap.get("verificationStatus") !== "verified") {
      throw new HttpsError("failed-precondition", "La escuela no está verificada.");
    }
    if (!toolSnap.exists || toolSnap.get("type") !== "raffle") {
      throw new HttpsError("failed-precondition", "La rifa no existe.");
    }
    // Config rides under `config` (normalized) or a legacy `raffle` field; numberCount is fixed at
    // RAFFLE_NUMBER_COUNT for every existing raffle, so default to it when absent.
    const cfg = (toolSnap.get("config") ?? toolSnap.get("raffle") ?? {}) as {
      numberCount?: number;
      currency?: string;
    };
    const numberCount =
      typeof cfg.numberCount === "number" ? cfg.numberCount : RAFFLE_NUMBER_COUNT;
    const currency = typeof cfg.currency === "string" ? cfg.currency : "CRC";

    const reserved = new Set<number>();
    let buyerPendingCount = 0;
    for (const docSnap of ordersSnap.docs) {
      const status = docSnap.get("status");
      if (status !== "pending" && status !== "confirmed") continue; // expired/other don't hold numbers
      const nums = docSnap.get("numbers");
      if (!Array.isArray(nums)) continue;
      for (const n of nums) if (typeof n === "number") reserved.add(n);
      if (status === "pending" && docSnap.get("buyerId") === buyerId) {
        buyerPendingCount += nums.length;
      }
    }

    const err = raffleReservationError(numbers, numberCount, reserved, buyerPendingCount);
    if (err) throw toHttpsError(err);

    // Write the public order ONLY (no money/PII): schoolName + toolTitle are denormalized from the
    // authoritative docs, never trusted from the client. The buyer's name + amount go to the
    // private subdoc the client writes next (rules let the buyer create it on this pending order).
    const newRef = db.collection(RAFFLE_ORDERS).doc();
    tx.set(newRef, {
      schoolId,
      schoolName: schoolSnap.get("name") ?? "",
      toolId,
      toolTitle: toolSnap.get("title") ?? "",
      buyerId,
      numbers,
      currency,
      status: "pending",
      confirmedAt: null,
      proofUploaded: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return newRef.id;
  });

  return { orderId };
});
