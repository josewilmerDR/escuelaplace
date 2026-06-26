import { describe, expect, it } from "vitest";
import { raffleNumberStates } from "./raffles";
import type { RaffleNumberState } from "./raffles";
import type { RaffleOrderStatus } from "@/types";

// Minimal fixture type — only the fields raffleNumberStates cares about.
type OrderStub = Pick<
  { numbers: number[]; status: RaffleOrderStatus },
  "numbers" | "status"
>;

describe("raffleNumberStates", () => {
  // ── count / empty base cases ─────────────────────────────────────────────────

  it("produces exactly count entries, all 'available', for an empty orders list", () => {
    const result = raffleNumberStates([], 5);
    expect(result).toHaveLength(5);
    expect(result.every((s) => s === "available")).toBe(true);
  });

  it("returns an empty array when count is 0", () => {
    const result = raffleNumberStates([], 0);
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it("produces exactly count entries for count=1", () => {
    const result = raffleNumberStates([], 1);
    expect(result).toEqual(["available"]);
  });

  it("produces exactly count=100 entries, all available, for an empty order list", () => {
    const result = raffleNumberStates([], 100);
    expect(result).toHaveLength(100);
    expect(result.every((s) => s === "available")).toBe(true);
  });

  // ── confirmed → sold ─────────────────────────────────────────────────────────

  it("marks numbers from a confirmed order as 'sold'", () => {
    const orders: OrderStub[] = [{ numbers: [0, 2, 4], status: "confirmed" }];
    const result = raffleNumberStates(orders, 5);
    expect(result[0]).toBe("sold");
    expect(result[1]).toBe("available");
    expect(result[2]).toBe("sold");
    expect(result[3]).toBe("available");
    expect(result[4]).toBe("sold");
  });

  it("marks all numbers in a single confirmed order as 'sold' when they span the full range", () => {
    const orders: OrderStub[] = [{ numbers: [0, 1, 2], status: "confirmed" }];
    const result = raffleNumberStates(orders, 3);
    expect(result).toEqual(["sold", "sold", "sold"] as RaffleNumberState[]);
  });

  // ── pending → reserved ───────────────────────────────────────────────────────

  it("marks numbers from a pending order as 'reserved'", () => {
    const orders: OrderStub[] = [{ numbers: [1, 3], status: "pending" }];
    const result = raffleNumberStates(orders, 5);
    expect(result[0]).toBe("available");
    expect(result[1]).toBe("reserved");
    expect(result[2]).toBe("available");
    expect(result[3]).toBe("reserved");
    expect(result[4]).toBe("available");
  });

  // ── expired / other status → available (no mark applied) ────────────────────

  it("leaves numbers from an expired order as 'available'", () => {
    // "expired" is not a valid RaffleOrderStatus; cast to exercise the fallthrough.
    const orders: OrderStub[] = [
      { numbers: [0, 1, 2], status: "expired" as RaffleOrderStatus },
    ];
    const result = raffleNumberStates(orders, 3);
    expect(result).toEqual(["available", "available", "available"] as RaffleNumberState[]);
  });

  it("leaves numbers from an unknown status as 'available'", () => {
    // "cancelled" is not a valid RaffleOrderStatus; cast to exercise the fallthrough.
    const orders: OrderStub[] = [
      { numbers: [0], status: "cancelled" as RaffleOrderStatus },
    ];
    const result = raffleNumberStates(orders, 3);
    expect(result).toEqual(["available", "available", "available"] as RaffleNumberState[]);
  });

  // ── 'sold' wins over 'reserved' ──────────────────────────────────────────────

  it("'sold' wins over 'reserved' when confirmed order comes first", () => {
    const orders: OrderStub[] = [
      { numbers: [1], status: "confirmed" },
      { numbers: [1], status: "pending" },
    ];
    const result = raffleNumberStates(orders, 3);
    expect(result[1]).toBe("sold");
  });

  it("'sold' wins over 'reserved' when pending order comes first (reserved never overwrites sold)", () => {
    const orders: OrderStub[] = [
      { numbers: [1], status: "pending" },
      { numbers: [1], status: "confirmed" },
    ];
    const result = raffleNumberStates(orders, 3);
    expect(result[1]).toBe("sold");
  });

  it("'sold' wins over 'reserved' regardless of order for multiple clashing numbers", () => {
    const orders: OrderStub[] = [
      { numbers: [0, 2, 4], status: "pending" },
      { numbers: [2, 4], status: "confirmed" },
    ];
    const result = raffleNumberStates(orders, 5);
    expect(result[0]).toBe("reserved");
    expect(result[1]).toBe("available");
    expect(result[2]).toBe("sold");
    expect(result[3]).toBe("available");
    expect(result[4]).toBe("sold");
  });

  it("reserved never overwrites an already-sold cell even when multiple pending orders target it", () => {
    const orders: OrderStub[] = [
      { numbers: [3], status: "confirmed" },
      { numbers: [3], status: "pending" },
      { numbers: [3], status: "pending" },
    ];
    const result = raffleNumberStates(orders, 5);
    expect(result[3]).toBe("sold");
  });

  // ── out-of-range, negative and non-integer numbers are ignored ───────────────

  it("ignores negative numbers", () => {
    const orders: OrderStub[] = [{ numbers: [-1, 0], status: "confirmed" }];
    const result = raffleNumberStates(orders, 3);
    // -1 is out of range; only index 0 is sold
    expect(result[0]).toBe("sold");
    expect(result[1]).toBe("available");
    expect(result[2]).toBe("available");
  });

  it("ignores numbers equal to count (out of range)", () => {
    const orders: OrderStub[] = [{ numbers: [3, 5], status: "confirmed" }];
    const result = raffleNumberStates(orders, 3);
    // 3 and 5 are both >= count=3 so no write occurs
    expect(result).toEqual(["available", "available", "available"] as RaffleNumberState[]);
  });

  it("ignores numbers greater than count", () => {
    const orders: OrderStub[] = [{ numbers: [100], status: "pending" }];
    const result = raffleNumberStates(orders, 10);
    expect(result.every((s) => s === "available")).toBe(true);
  });

  it("ignores non-integer (float) numbers", () => {
    const orders: OrderStub[] = [{ numbers: [1.5, 2], status: "confirmed" }];
    const result = raffleNumberStates(orders, 5);
    // 1.5 is ignored; only index 2 is sold
    expect(result[1]).toBe("available");
    expect(result[2]).toBe("sold");
  });

  it("ignores NaN entries in numbers array", () => {
    const orders: OrderStub[] = [{ numbers: [NaN, 0], status: "confirmed" }];
    const result = raffleNumberStates(orders, 3);
    expect(result[0]).toBe("sold");
    expect(result[1]).toBe("available");
  });

  it("does not write past array bounds even when numbers list is very large and out of range", () => {
    const orders: OrderStub[] = [
      { numbers: [0, 99, 100, 999, -5], status: "confirmed" },
    ];
    const result = raffleNumberStates(orders, 5);
    expect(result).toHaveLength(5);
    // Only 0 is valid
    expect(result[0]).toBe("sold");
    expect(result[1]).toBe("available");
    expect(result[2]).toBe("available");
    expect(result[3]).toBe("available");
    expect(result[4]).toBe("available");
  });

  // ── multiple orders of different statuses together ───────────────────────────

  it("handles a mix of confirmed, pending, and expired orders correctly", () => {
    const orders: OrderStub[] = [
      { numbers: [0, 1], status: "confirmed" },
      { numbers: [2, 3], status: "pending" },
      // "expired" is not a valid RaffleOrderStatus; cast to exercise the fallthrough.
      { numbers: [4], status: "expired" as RaffleOrderStatus },
    ];
    const result = raffleNumberStates(orders, 5);
    expect(result[0]).toBe("sold");
    expect(result[1]).toBe("sold");
    expect(result[2]).toBe("reserved");
    expect(result[3]).toBe("reserved");
    expect(result[4]).toBe("available");
  });

  it("handles an order with an empty numbers array gracefully", () => {
    const orders: OrderStub[] = [
      { numbers: [], status: "confirmed" },
      { numbers: [2], status: "pending" },
    ];
    const result = raffleNumberStates(orders, 5);
    expect(result[2]).toBe("reserved");
    expect(result.filter((s) => s !== "available")).toHaveLength(1);
  });
});
