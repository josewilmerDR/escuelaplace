import { describe, expect, it } from "vitest";
import {
  bingoFormatError,
  columnRange,
  getBingoCardAvailability,
  nextCardStartNumber,
  parseImportedCards,
  randomCardNumbers,
} from "./bingo-cards";
import { BINGO_FREE_CENTER, type BingoFormat } from "@/types";

// Generic small format: 3×3 over 0–99. Split into 3 column bands → [0,33] [34,66] [67,99].
const FMT: BingoFormat = { rows: 3, cols: 3, poolMin: 0, poolMax: 99 };
// The production bingo: 5×5 over 0–75, the classic B-I-N-G-O column bands.
const BINGO: BingoFormat = { rows: 5, cols: 5, poolMin: 0, poolMax: 75 };

describe("columnRange", () => {
  it("splits the standard 5×5 / 0–75 bingo into the classic B-I-N-G-O bands", () => {
    expect([0, 1, 2, 3, 4].map((c) => columnRange(BINGO, c))).toEqual([
      [0, 15],
      [16, 30],
      [31, 45],
      [46, 60],
      [61, 75],
    ]);
  });

  it("hands the remainder to the earliest columns and keeps bands contiguous", () => {
    // 100 numbers over 3 columns → base 33, remainder 1 (col 0 gets the extra).
    expect([0, 1, 2].map((c) => columnRange(FMT, c))).toEqual([
      [0, 33],
      [34, 66],
      [67, 99],
    ]);
  });

  it("splits evenly when the pool divides by the column count", () => {
    expect(
      [0, 1, 2].map((c) =>
        columnRange({ rows: 3, cols: 3, poolMin: 1, poolMax: 9 }, c),
      ),
    ).toEqual([
      [1, 3],
      [4, 6],
      [7, 9],
    ]);
  });
});

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

  it("rejects a negative número menor (keeps the free-center sentinel out of band)", () => {
    // A negative poolMin lets a column band contain BINGO_FREE_CENTER (-1), which would collide
    // with the free-center sentinel — forbidden. Valid 0-based pools are unaffected.
    expect(
      bingoFormatError({ rows: 5, cols: 5, poolMin: -5, poolMax: 69 }),
    ).toBeTruthy();
    expect(
      bingoFormatError({ rows: 5, cols: 5, poolMin: -1, poolMax: 75 }),
    ).toBeTruthy();
    expect(bingoFormatError(BINGO)).toBeNull();
  });
});

describe("randomCardNumbers", () => {
  it("returns rows*cols distinct numbers, each cell within its column's band", () => {
    for (let trial = 0; trial < 20; trial++) {
      const nums = randomCardNumbers(FMT);
      expect(nums).toHaveLength(9);
      expect(new Set(nums).size).toBe(9); // distinct
      // Row-major: cell index = row*cols + col, so a cell's column is index % cols.
      nums.forEach((n, i) => {
        const [lo, hi] = columnRange(FMT, i % FMT.cols);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(lo);
        expect(n).toBeLessThanOrEqual(hi);
      });
    }
  });

  it("keeps the standard bingo's B-I-N-G-O columns", () => {
    for (let trial = 0; trial < 20; trial++) {
      const nums = randomCardNumbers(BINGO);
      expect(nums).toHaveLength(25);
      expect(new Set(nums).size).toBe(25);
      nums.forEach((n, i) => {
        const [lo, hi] = columnRange(BINGO, i % BINGO.cols);
        expect(n).toBeGreaterThanOrEqual(lo);
        expect(n).toBeLessThanOrEqual(hi);
      });
    }
  });

  it("uses the full band when a column's range equals the row count", () => {
    // 3×3 over 1–9: each column band holds exactly 3 numbers, so all must appear.
    const nums = randomCardNumbers({ rows: 3, cols: 3, poolMin: 1, poolMax: 9 });
    expect([...nums].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Column 0 (positions 0,3,6) draws from [1,3], column 2 (2,5,8) from [7,9].
    expect([nums[0], nums[3], nums[6]].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([nums[2], nums[5], nums[8]].sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });

  it("frees the center cell (sentinel) on a 5×5 when freeCenter is set", () => {
    for (let trial = 0; trial < 20; trial++) {
      const nums = randomCardNumbers(BINGO, true);
      expect(nums).toHaveLength(25);
      expect(nums[12]).toBe(BINGO_FREE_CENTER);
      // The other 24 cells are distinct real numbers, each still inside ITS column's band.
      const real = nums.filter((_, i) => i !== 12);
      expect(new Set(real).size).toBe(24);
      real.forEach((n, idx) => {
        const pos = idx < 12 ? idx : idx + 1; // skip the freed center
        const [lo, hi] = columnRange(BINGO, pos % BINGO.cols);
        expect(n).toBeGreaterThanOrEqual(lo);
        expect(n).toBeLessThanOrEqual(hi);
      });
    }
  });
});

describe("parseImportedCards", () => {
  // Column bands for FMT (3×3 / 0–99): col0 [0,33], col1 [34,66], col2 [67,99]. Row-major, so a
  // line reads row by row: pos0,1,2 = row0 cols 0,1,2; pos3,4,5 = row1; pos6,7,8 = row2.
  it("parses one cartón per line with auto labels", () => {
    const res = parseImportedCards(
      "1 40 70 2 41 71 3 42 72\n10,50,90,11,51,91,12,52,92",
      FMT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cards).toHaveLength(2);
    expect(res.cards[0]).toEqual({
      label: "1",
      numbers: [1, 40, 70, 2, 41, 71, 3, 42, 72],
    });
    expect(res.cards[1].label).toBe("2");
  });

  it("honors an explicit label before a colon", () => {
    const res = parseImportedCards("A07: 1 40 70 2 41 71 3 42 72", FMT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cards[0].label).toBe("A07");
  });

  it("rejects a wrong count, an out-of-band value, or a duplicate", () => {
    expect(parseImportedCards("1 40 70", FMT).ok).toBe(false); // too few
    // 2 sits in column 1's position but column 1's band is [34,66] → out of band.
    expect(parseImportedCards("1 2 70 3 41 71 4 42 72", FMT).ok).toBe(false);
    // 70 is valid for column 2 but repeated.
    expect(parseImportedCards("1 40 70 2 41 70 3 42 72", FMT).ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(parseImportedCards("   \n  ", FMT).ok).toBe(false);
  });

  it("with a free center, imports 24 numbers and frees the middle (sentinel at index 12)", () => {
    // 24 numbers in row-major order SKIPPING the center (position 12). BINGO bands:
    // col0 [0,15] col1 [16,30] col2 [31,45] col3 [46,60] col4 [61,75].
    const line =
      "0 16 31 46 61 1 17 32 47 62 2 18 48 63 3 19 33 49 64 4 20 34 50 65";
    const res = parseImportedCards(line, BINGO, true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cards[0].numbers).toHaveLength(25);
    expect(res.cards[0].numbers[12]).toBe(BINGO_FREE_CENTER);
    expect(res.cards[0].numbers).toEqual([
      0, 16, 31, 46, 61, 1, 17, 32, 47, 62, 2, 18, BINGO_FREE_CENTER, 48, 63, 3,
      19, 33, 49, 64, 4, 20, 34, 50, 65,
    ]);
  });

  it("with a free center, rejects a full 25-number line (expects 24)", () => {
    const line25 =
      "0 16 31 46 61 1 17 32 47 62 2 18 40 48 63 3 19 33 49 64 4 20 34 50 65";
    expect(parseImportedCards(line25, BINGO, true).ok).toBe(false);
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
