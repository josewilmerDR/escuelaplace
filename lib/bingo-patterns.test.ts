import { describe, expect, it } from "vitest";
import {
  BINGO_BUILTIN_PATTERNS,
  BINGO_BUILTIN_PATTERN_BY_ID,
  gridCenterIndex,
  maskSatisfied,
  winningLineIndices,
} from "./bingo-patterns";
import { BINGO_FREE_CENTER, type BingoFormat } from "@/types";

const FMT: Pick<BingoFormat, "rows" | "cols"> = { rows: 3, cols: 3 };

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

describe("gridCenterIndex", () => {
  it("is the middle cell on odd×odd grids (5×5 → 12)", () => {
    expect(gridCenterIndex(5, 5)).toBe(12);
    expect(gridCenterIndex(3, 3)).toBe(4);
    expect(gridCenterIndex(7, 7)).toBe(24);
  });

  it("is null when any dimension is even (no single middle) or degenerate", () => {
    expect(gridCenterIndex(4, 4)).toBeNull();
    expect(gridCenterIndex(5, 4)).toBeNull();
    expect(gridCenterIndex(0, 5)).toBeNull();
  });
});

describe("maskSatisfied", () => {
  it("wins when the hit covers some arrangement", () => {
    expect(maskSatisfied(CARD5, [[0, 4, 20, 24]], hitFor([0, 4, 20, 24]))).toBe(true);
    expect(maskSatisfied(CARD5, [[0, 4, 20, 24]], hitFor([0, 4, 20]))).toBe(false);
  });

  it("treats a free center as covered without it being called", () => {
    const free = new Set([12]);
    const diagMain = [[0, 6, 12, 18, 24]];
    // Center (12) is NOT in the hit set, but the free index covers it → the rest wins it.
    expect(maskSatisfied(CARD5, diagMain, hitFor([0, 6, 18, 24]))).toBe(false);
    expect(maskSatisfied(CARD5, diagMain, hitFor([0, 6, 18, 24]), free)).toBe(true);
    // A free center doesn't excuse the OTHER cells of the line.
    expect(maskSatisfied(CARD5, diagMain, hitFor([0, 6, 18]), free)).toBe(false);
    // A line that doesn't cross the free cell is unaffected by it.
    const topRow = [[0, 1, 2, 3, 4]];
    expect(maskSatisfied(CARD5, topRow, hitFor([0, 1, 2, 3]), free)).toBe(false);
    expect(maskSatisfied(CARD5, topRow, hitFor([0, 1, 2, 3, 4]), free)).toBe(true);
  });

  it("ignores called numbers not on the cartón", () => {
    const hit = new Set([...hitFor([0, 1, 2, 3, 4]), 999]);
    expect(maskSatisfied(CARD5, [[0, 1, 2, 3, 4]], hit)).toBe(true);
  });

  it("treats a BINGO_FREE_CENTER sentinel cell as covered (the deck-level free center)", () => {
    // A card carrying the sentinel at its center (index 12) — no freeIndices needed.
    const card = [...CARD5];
    card[12] = BINGO_FREE_CENTER;
    const diagMain = [[0, 6, 12, 18, 24]];
    expect(maskSatisfied(card, diagMain, hitFor([0, 6, 18, 24]))).toBe(true);
    // The sentinel covers only its own cell — the other four still must be called.
    expect(maskSatisfied(card, diagMain, hitFor([0, 6, 18]))).toBe(false);
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
