/**
 * Pure reservation logic for the raffle arbiter (no Firebase imports) — the part of
 * `reserveRaffleNumbers` (./raffle) that decides whether a buyer may reserve a set of numbers,
 * given the raffle's CURRENT state. Kept dependency-free so it can be unit-tested + drift-guarded
 * from the app's Vitest run (lib/firestore/raffle-arbiter.test.ts), exactly like the ranking
 * weights and donor thresholds.
 *
 * WHY a Cloud Function owns this at all: the two invariants that actually close the raffle
 * grid-lock DoS (#N1) — (1) a number can't be reserved by two active orders, and (2) one buyer
 * can't hold the whole grid pending — both require reading ACROSS orders, which Firestore rules
 * cannot do (they see only the single doc being written, can't iterate a list, can't dedup across
 * docs). So the arbiter runs them in a transaction with the Admin SDK; the rules deny direct client
 * creates of raffleOrders, making this the sole writer.
 */

/**
 * Mirror of the app's raffle constants (the functions runtime can't import app code). Keep in sync
 * with types/firestore.ts — the drift guard in lib/firestore/raffle-arbiter.test.ts fails otherwise.
 */
export const RAFFLE_NUMBER_COUNT = 100;
export const RAFFLE_ORDER_NUMBERS_MAX = 25;

/**
 * Server-only anti-fraud policy (no app mirror): the max raffle numbers ONE buyer may hold
 * RESERVED (pending) at once in a single raffle. Caps a single account's grid occupancy so it can't
 * lock the whole board even by splitting across many orders — the per-order cap alone wouldn't
 * (4 orders × 25 = the whole grid). To reserve more, the buyer waits for the school to confirm
 * (which moves numbers from "reserved" to "sold", freeing the cap).
 */
export const RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER = 25;

/** Why a reservation was refused — mapped to a typed HttpsError by the callable. */
export type ReservationError =
  | { code: "invalid"; message: string }
  | { code: "buyer-cap"; message: string }
  | { code: "taken"; message: string; taken: number[] };

/**
 * Validate a reservation against the raffle's CURRENT state. Pure: the callable feeds it the numbers
 * already held by ANY active order (`reserved`) and how many this buyer already holds pending
 * (`buyerPendingCount`). Returns null when the request is valid, else a typed error.
 *
 * Checked in order: shape (1..MAX distinct in-range integers) → per-buyer pending cap → uniqueness
 * (none already taken). All-or-nothing: if any requested number is taken, the whole request fails
 * (the client pre-filters taken numbers, so this only catches a race, and a partial order would
 * desync the amount the buyer already computed).
 */
export function raffleReservationError(
  requested: readonly number[],
  numberCount: number,
  reserved: ReadonlySet<number>,
  buyerPendingCount: number,
): ReservationError | null {
  if (requested.length === 0) {
    return { code: "invalid", message: "Selecciona al menos un número." };
  }
  if (requested.length > RAFFLE_ORDER_NUMBERS_MAX) {
    return {
      code: "invalid",
      message: `Máximo ${RAFFLE_ORDER_NUMBERS_MAX} números por compra.`,
    };
  }
  const seen = new Set<number>();
  for (const n of requested) {
    if (!Number.isInteger(n) || n < 0 || n >= numberCount) {
      return { code: "invalid", message: "Hay un número fuera de rango en tu selección." };
    }
    if (seen.has(n)) {
      return { code: "invalid", message: "Hay números repetidos en tu selección." };
    }
    seen.add(n);
  }
  if (buyerPendingCount + requested.length > RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER) {
    return {
      code: "buyer-cap",
      message:
        `Ya tienes números apartados sin confirmar. Espera a que la escuela confirme tu pago ` +
        `antes de apartar más (máximo ${RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER} a la vez).`,
    };
  }
  const taken = requested.filter((n) => reserved.has(n));
  if (taken.length > 0) {
    return {
      code: "taken",
      message: "Algunos números ya fueron tomados. Vuelve a la rifa y elige otros.",
      taken,
    };
  }
  return null;
}
