import { describe, expect, it } from "vitest";
import {
  cardSatisfiesPattern,
  satisfiedPatterns,
  winningLineIndices,
} from "./bingo-patterns";
import type { BingoFormat } from "@/types";

const FMT: Pick<BingoFormat, "rows" | "cols"> = { rows: 3, cols: 3 };

// A 3×3 cartón, row-major:
//   1 2 3
//   4 5 6
//   7 8 9
const CARD = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe("winningLineIndices", () => {
  it("returns each row / column", () => {
    expect(winningLineIndices(FMT, "row")).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ]);
    expect(winningLineIndices(FMT, "column")).toEqual([
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
    ]);
  });

  it("returns both diagonals only on a square grid", () => {
    expect(winningLineIndices(FMT, "diagonal")).toEqual([
      [0, 4, 8],
      [2, 4, 6],
    ]);
    // Non-square → no diagonal is possible.
    expect(winningLineIndices({ rows: 3, cols: 9 }, "diagonal")).toEqual([]);
  });

  it("returns one all-cells line for full", () => {
    expect(winningLineIndices(FMT, "full")).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8]]);
  });
});

describe("cardSatisfiesPattern", () => {
  it("detects a completed row", () => {
    // Middle row = numbers 4,5,6.
    expect(cardSatisfiesPattern(CARD, FMT, "row", new Set([4, 5, 6]))).toBe(true);
    // Missing one of the three → not satisfied.
    expect(cardSatisfiesPattern(CARD, FMT, "row", new Set([4, 5]))).toBe(false);
  });

  it("detects a column and a diagonal", () => {
    expect(cardSatisfiesPattern(CARD, FMT, "column", new Set([2, 5, 8]))).toBe(true);
    expect(cardSatisfiesPattern(CARD, FMT, "diagonal", new Set([1, 5, 9]))).toBe(true);
    expect(cardSatisfiesPattern(CARD, FMT, "diagonal", new Set([3, 5, 7]))).toBe(true);
  });

  it("requires every cell for full", () => {
    expect(cardSatisfiesPattern(CARD, FMT, "full", new Set(CARD))).toBe(true);
    expect(
      cardSatisfiesPattern(CARD, FMT, "full", new Set([1, 2, 3, 4, 5, 6, 7, 8])),
    ).toBe(false);
  });

  it("ignores extra called numbers not on the cartón", () => {
    // 99 isn't on the cartón; the top row is still complete.
    expect(cardSatisfiesPattern(CARD, FMT, "row", new Set([1, 2, 3, 99]))).toBe(true);
  });

  it("never wins a non-square diagonal", () => {
    const wide = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 3×3 numbers but declared 3×9
    expect(cardSatisfiesPattern(wide, { rows: 3, cols: 9 }, "diagonal", new Set(wide))).toBe(
      false,
    );
  });
});

describe("satisfiedPatterns", () => {
  it("returns only enabled patterns that are met, in order", () => {
    // Top row complete (1,2,3) and main diagonal complete (1,5,9).
    const hit = new Set([1, 2, 3, 5, 9]);
    expect(satisfiedPatterns(CARD, FMT, ["row", "column", "diagonal", "full"], hit)).toEqual([
      "row",
      "diagonal",
    ]);
  });

  it("returns empty when a marked set forms no enabled line", () => {
    expect(satisfiedPatterns(CARD, FMT, ["row", "column"], new Set([1, 5, 9]))).toEqual([]);
  });
});
