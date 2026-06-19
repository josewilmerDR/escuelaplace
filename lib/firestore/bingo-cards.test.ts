import { describe, expect, it } from "vitest";
import {
  bingoFormatError,
  getBingoCardAvailability,
  nextCardStartNumber,
  parseImportedCards,
  randomCardNumbers,
} from "./bingo-cards";
import type { BingoFormat } from "@/types";

const FMT: BingoFormat = { rows: 3, cols: 3, poolMin: 0, poolMax: 99 };

describe("bingoFormatError", () => {
  it("accepts a valid format", () => {
    expect(bingoFormatError(FMT)).toBeNull();
    expect(
      bingoFormatError({ rows: 9, cols: 9, poolMin: 0, poolMax: 99 }),
    ).toBeNull();
  });

  it("rejects out-of-bounds dimensions", () => {
    expect(
      bingoFormatError({ rows: 2, cols: 3, poolMin: 0, poolMax: 99 }),
    ).toBeTruthy();
    expect(
      bingoFormatError({ rows: 3, cols: 10, poolMin: 0, poolMax: 99 }),
    ).toBeTruthy();
    expect(
      bingoFormatError({ rows: 3.5, cols: 3, poolMin: 0, poolMax: 99 }),
    ).toBeTruthy();
  });

  it("rejects an invalid or too-small pool", () => {
    // 3x3 = 9 cells but only 5 numbers in the pool.
    expect(
      bingoFormatError({ rows: 3, cols: 3, poolMin: 1, poolMax: 5 }),
    ).toBeTruthy();
    // poolMax < poolMin.
    expect(
      bingoFormatError({ rows: 3, cols: 3, poolMin: 10, poolMax: 0 }),
    ).toBeTruthy();
  });

  it("accepts a pool exactly the size of the grid", () => {
    expect(
      bingoFormatError({ rows: 3, cols: 3, poolMin: 1, poolMax: 9 }),
    ).toBeNull();
  });
});

describe("randomCardNumbers", () => {
  it("returns rows*cols distinct numbers within the pool", () => {
    for (let trial = 0; trial < 20; trial++) {
      const nums = randomCardNumbers(FMT);
      expect(nums).toHaveLength(9);
      expect(new Set(nums).size).toBe(9); // distinct
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(99);
        expect(Number.isInteger(n)).toBe(true);
      }
    }
  });

  it("uses the full pool when it equals the grid size", () => {
    const nums = randomCardNumbers({ rows: 3, cols: 3, poolMin: 1, poolMax: 9 });
    expect([...nums].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("parseImportedCards", () => {
  it("parses one cartón per line with auto labels", () => {
    const res = parseImportedCards("1 2 3 4 5 6 7 8 9\n10,11,12,13,14,15,16,17,18", FMT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cards).toHaveLength(2);
    expect(res.cards[0]).toEqual({ label: "1", numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(res.cards[1].label).toBe("2");
  });

  it("honors an explicit label before a colon", () => {
    const res = parseImportedCards("A07: 1 2 3 4 5 6 7 8 9", FMT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cards[0].label).toBe("A07");
  });

  it("rejects a wrong count, out-of-range, or duplicate", () => {
    expect(parseImportedCards("1 2 3", FMT).ok).toBe(false); // too few
    expect(parseImportedCards("1 2 3 4 5 6 7 8 100", FMT).ok).toBe(false); // out of range
    expect(parseImportedCards("1 1 2 3 4 5 6 7 8", FMT).ok).toBe(false); // duplicate
  });

  it("rejects empty input", () => {
    expect(parseImportedCards("   \n  ", FMT).ok).toBe(false);
  });
});

describe("nextCardStartNumber", () => {
  it("is one past the highest numeric label (not the count) — survives deletes", () => {
    // 50 generated then #25 deleted: count is 49 but the next serial must be 51, not 50.
    const labels = Array.from({ length: 50 }, (_, i) =>
      String(i + 1).padStart(3, "0"),
    ).filter((l) => l !== "025");
    expect(nextCardStartNumber(labels.map((label) => ({ label })))).toBe(51);
  });

  it("starts at 1 for an empty lote and ignores non-numeric (imported) labels", () => {
    expect(nextCardStartNumber([])).toBe(1);
    expect(
      nextCardStartNumber([{ label: "A07" }, { label: "B12" }]),
    ).toBe(1);
    expect(
      nextCardStartNumber([{ label: "A07" }, { label: "003" }]),
    ).toBe(4);
  });
});

describe("getBingoCardAvailability", () => {
  it("subtracts sold cards and pending-reserved quantities", () => {
    const cards = [
      { status: "available" as const },
      { status: "available" as const },
      { status: "available" as const },
      { status: "sold" as const },
    ];
    const orders = [
      { status: "pending" as const, quantity: 2 },
      { status: "confirmed" as const, quantity: 1 }, // its card is already 'sold'
    ];
    const a = getBingoCardAvailability(cards, orders);
    expect(a.total).toBe(4);
    expect(a.sold).toBe(1);
    expect(a.pendingReserved).toBe(2);
    expect(a.available).toBe(1); // 4 - 1 - 2
  });

  it("never returns a negative available count", () => {
    const cards = [{ status: "available" as const }];
    const orders = [{ status: "pending" as const, quantity: 50 }];
    expect(getBingoCardAvailability(cards, orders).available).toBe(0);
  });
});
