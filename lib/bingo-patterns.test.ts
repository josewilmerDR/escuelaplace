import { describe, expect, it } from "vitest";
import {
  BINGO_BUILTIN_PATTERNS,
  BINGO_BUILTIN_PATTERN_BY_ID,
  cardSatisfiesPattern,
  maskSatisfied,
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

// ── 5×5 mask-based patterns (the live "modalidades") ────────────────────────────
//
// A 5×5 cartón where cell index i holds the number i+1, so a hit set covering a list of cell
// indices is hitFor(cells). The arrangements ARE the anti-cheat truth, so every silhouette is
// pinned exactly here — a single wrong index would silently let a non-winning cartón "win".
const CARD5 = Array.from({ length: 25 }, (_, i) => i + 1);
const hitFor = (cells: number[]) => new Set(cells.map((i) => CARD5[i]));
const byId = (id: string) => {
  const def = BINGO_BUILTIN_PATTERN_BY_ID[id];
  if (!def) throw new Error(`missing builtin ${id}`);
  return def;
};

describe("maskSatisfied", () => {
  it("wins when the hit covers some arrangement", () => {
    expect(maskSatisfied(CARD5, [[0, 4, 20, 24]], hitFor([0, 4, 20, 24]))).toBe(true);
    expect(maskSatisfied(CARD5, [[0, 4, 20, 24]], hitFor([0, 4, 20]))).toBe(false);
  });

  it("ignores called numbers not on the cartón", () => {
    const hit = new Set([...hitFor([0, 1, 2, 3, 4]), 999]);
    expect(maskSatisfied(CARD5, [[0, 1, 2, 3, 4]], hit)).toBe(true);
  });

  it("equals the legacy enum predicate (delegation)", () => {
    const hit = new Set([1, 2, 3]); // top row of the 3×3 CARD
    expect(maskSatisfied(CARD, winningLineIndices(FMT, "row"), hit)).toBe(
      cardSatisfiesPattern(CARD, FMT, "row", hit),
    );
  });
});

describe("BINGO_BUILTIN_PATTERNS geometry", () => {
  it("lists the 10 modalidades in catalog order", () => {
    expect(BINGO_BUILTIN_PATTERNS.map((p) => p.id)).toEqual([
      "line",
      "diagonal",
      "corners",
      "frame_inner",
      "frame_outer",
      "full",
      "letter_x",
      "letter_h",
      "double_line",
      "pinwheel",
    ]);
  });

  it("every arrangement and preview cell is a distinct index in 0..24", () => {
    for (const def of BINGO_BUILTIN_PATTERNS) {
      for (const arr of def.arrangements) {
        expect(arr.length).toBeGreaterThan(0);
        expect(new Set(arr).size).toBe(arr.length);
        for (const c of arr) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(25);
        }
      }
      expect(new Set(def.preview).size).toBe(def.preview.length);
      for (const c of def.preview) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(25);
      }
    }
  });

  it("pins each fixed silhouette exactly", () => {
    expect(byId("corners").arrangements).toEqual([[0, 4, 20, 24]]);
    expect(byId("frame_inner").arrangements).toEqual([[6, 7, 8, 11, 13, 16, 17, 18]]);
    expect(byId("frame_outer").arrangements[0]).toHaveLength(16);
    expect(byId("full").arrangements[0]).toHaveLength(25);
    expect(byId("letter_x").arrangements).toEqual([[0, 4, 6, 8, 12, 16, 18, 20, 24]]);
    expect(byId("letter_h").arrangements).toEqual([
      [0, 4, 5, 9, 10, 11, 12, 13, 14, 15, 19, 20, 24],
    ]);
    expect(byId("pinwheel").arrangements).toEqual([[2, 3, 5, 10, 12, 14, 19, 21, 22]]);
    expect(byId("diagonal").arrangements).toEqual([
      [0, 6, 12, 18, 24],
      [4, 8, 12, 16, 20],
    ]);
  });

  it("line = 5 rows + 5 cols, never a diagonal", () => {
    const line = byId("line");
    expect(line.arrangements).toHaveLength(10);
    expect(line.arrangements.every((a) => a.length === 5)).toBe(true);
    expect(maskSatisfied(CARD5, line.arrangements, hitFor([0, 6, 12, 18, 24]))).toBe(false);
    expect(maskSatisfied(CARD5, line.arrangements, hitFor([0, 1, 2, 3, 4]))).toBe(true);
    expect(maskSatisfied(CARD5, line.arrangements, hitFor([0, 5, 10, 15, 20]))).toBe(true);
  });

  it("double_line = two PARALLEL lines only (no row+col mix)", () => {
    const dbl = byId("double_line");
    expect(dbl.arrangements).toHaveLength(20);
    expect(dbl.arrangements.every((a) => a.length === 10)).toBe(true);
    // two full rows / two full columns win
    expect(maskSatisfied(CARD5, dbl.arrangements, hitFor([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(true);
    expect(
      maskSatisfied(CARD5, dbl.arrangements, hitFor([0, 5, 10, 15, 20, 1, 6, 11, 16, 21])),
    ).toBe(true);
    // a full row + a full column (a mix) does NOT win
    expect(
      maskSatisfied(CARD5, dbl.arrangements, hitFor([0, 1, 2, 3, 4, 5, 10, 15, 20])),
    ).toBe(false);
  });

  it("letter_x needs BOTH diagonals; diagonal needs EITHER", () => {
    const mainOnly = hitFor([0, 6, 12, 18, 24]);
    expect(maskSatisfied(CARD5, byId("diagonal").arrangements, mainOnly)).toBe(true);
    expect(maskSatisfied(CARD5, byId("letter_x").arrangements, mainOnly)).toBe(false);
    expect(
      maskSatisfied(CARD5, byId("letter_x").arrangements, hitFor([0, 4, 6, 8, 12, 16, 18, 20, 24])),
    ).toBe(true);
  });
});
