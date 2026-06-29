import { describe, expect, it } from "vitest";
import {
  RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER,
  RAFFLE_NUMBER_COUNT as FN_RAFFLE_NUMBER_COUNT,
  RAFFLE_ORDER_NUMBERS_MAX as FN_RAFFLE_ORDER_NUMBERS_MAX,
  raffleReservationError,
} from "../../functions/src/raffle-logic";
import { RAFFLE_NUMBER_COUNT, RAFFLE_ORDER_NUMBERS_MAX } from "@/types";

/**
 * The raffle arbiter's PURE decision logic — the heart of the #N1 grid-lock fix. The Cloud Function
 * (functions/src/raffle.ts) only feeds it the transaction-read state; the rules that admit / refuse a
 * reservation live here, so they are unit-testable without the emulator.
 */
describe("raffleReservationError", () => {
  const N = RAFFLE_NUMBER_COUNT; // 100
  const noneReserved = new Set<number>();

  it("admits a valid in-range, distinct, within-cap selection", () => {
    expect(raffleReservationError([0, 5, 99], N, noneReserved, 0)).toBeNull();
    expect(
      raffleReservationError([1], N, new Set([2, 3]), 0),
    ).toBeNull();
  });

  it("rejects an empty selection", () => {
    expect(raffleReservationError([], N, noneReserved, 0)?.code).toBe("invalid");
  });

  it("rejects more than the per-order cap", () => {
    const over = Array.from({ length: RAFFLE_ORDER_NUMBERS_MAX + 1 }, (_, i) => i);
    expect(raffleReservationError(over, N, noneReserved, 0)?.code).toBe("invalid");
  });

  it("rejects out-of-range or non-integer numbers", () => {
    expect(raffleReservationError([N], N, noneReserved, 0)?.code).toBe("invalid"); // == count
    expect(raffleReservationError([-1], N, noneReserved, 0)?.code).toBe("invalid");
    expect(raffleReservationError([1.5], N, noneReserved, 0)?.code).toBe("invalid");
  });

  it("rejects duplicates within the selection", () => {
    expect(raffleReservationError([7, 7], N, noneReserved, 0)?.code).toBe("invalid");
  });

  it("rejects numbers already held by an active order (uniqueness), reporting which", () => {
    const err = raffleReservationError([3, 4, 5], N, new Set([4]), 0);
    expect(err?.code).toBe("taken");
    expect(err && err.code === "taken" && err.taken).toEqual([4]);
  });

  it("enforces the per-buyer pending cap across orders", () => {
    // Buyer already holds the max pending → any further reservation is refused.
    expect(
      raffleReservationError([50], N, noneReserved, RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER)?.code,
    ).toBe("buyer-cap");
    // Right at the edge: holding cap-1, asking for 1 more is fine; for 2 is not.
    expect(
      raffleReservationError([50], N, noneReserved, RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER - 1),
    ).toBeNull();
    expect(
      raffleReservationError(
        [50, 51],
        N,
        noneReserved,
        RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER - 1,
      )?.code,
    ).toBe("buyer-cap");
  });

  it("checks the per-buyer cap before uniqueness (a capped buyer learns the real blocker)", () => {
    expect(
      raffleReservationError([4], N, new Set([4]), RAFFLE_MAX_PENDING_NUMBERS_PER_BUYER)?.code,
    ).toBe("buyer-cap");
  });
});

describe("raffle constants drift guard (app vs Cloud Function)", () => {
  // The functions runtime can't import app code, so functions/src/raffle-logic.ts holds its own copy
  // of these. If they diverge, the arbiter would admit/refuse reservations the app's UI disagrees
  // with (e.g. a per-order cap mismatch). Fail loudly — same precedent as ranking/donors/thanks.
  it("mirrors RAFFLE_NUMBER_COUNT and RAFFLE_ORDER_NUMBERS_MAX", () => {
    expect(FN_RAFFLE_NUMBER_COUNT).toBe(RAFFLE_NUMBER_COUNT);
    expect(FN_RAFFLE_ORDER_NUMBERS_MAX).toBe(RAFFLE_ORDER_NUMBERS_MAX);
  });
});
