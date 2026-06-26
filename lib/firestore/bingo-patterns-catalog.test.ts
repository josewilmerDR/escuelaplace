import { describe, expect, it } from "vitest";
import { toPatternDef } from "./bingo-patterns-catalog";
import type { SavedBingoPatternDoc } from "@/types";

// Minimal fixture — Timestamp is not required by toPatternDef's logic; cast to satisfy the type.
const makeSaved = (
  overrides: Partial<SavedBingoPatternDoc> & { id: string; name: string; cells: number[] },
): SavedBingoPatternDoc =>
  ({
    createdBy: "uid-abc",
    createdAt: null as unknown as SavedBingoPatternDoc["createdAt"],
    ...overrides,
  } as SavedBingoPatternDoc);

describe("toPatternDef", () => {
  it("prefixes the id with 'custom:' followed by saved.id", () => {
    const saved = makeSaved({ id: "abc123", name: "Cruz", cells: [2, 7, 12, 17, 22] });
    expect(toPatternDef(saved).id).toBe("custom:abc123");
  });

  it("sets kind to 'custom'", () => {
    const saved = makeSaved({ id: "x", name: "Diagonal", cells: [0, 6, 12, 18, 24] });
    expect(toPatternDef(saved).kind).toBe("custom");
  });

  it("carries over the name unchanged", () => {
    const saved = makeSaved({ id: "y", name: "Esquinas", cells: [0, 4, 20, 24] });
    expect(toPatternDef(saved).name).toBe("Esquinas");
  });

  it("wraps cells in a single-element arrangements array", () => {
    const cells = [1, 3, 5, 7, 9];
    const saved = makeSaved({ id: "z", name: "Odd", cells });
    const def = toPatternDef(saved);
    expect(def.arrangements).toHaveLength(1);
    expect(def.arrangements[0]).toEqual(cells);
  });

  it("arrangements[0] is the same reference as cells (single arrangement, all cells required)", () => {
    const cells = [0, 12, 24];
    const saved = makeSaved({ id: "z2", name: "Test", cells });
    const def = toPatternDef(saved);
    // Same cells array: every cell in the stored arrangement must be required to win
    expect(def.arrangements[0]).toEqual(cells);
  });

  it("sets preview equal to saved.cells", () => {
    const cells = [0, 1, 2, 3, 4];
    const saved = makeSaved({ id: "p1", name: "Top row", cells });
    expect(toPatternDef(saved).preview).toEqual(cells);
  });

  it("preview and arrangements[0] reference the same cell values", () => {
    const cells = [5, 10, 15, 20, 24];
    const saved = makeSaved({ id: "p2", name: "Column-ish", cells });
    const def = toPatternDef(saved);
    expect(def.preview).toEqual(def.arrangements[0]);
  });

  it("works with a single-cell pattern (minimum cells length)", () => {
    const cells = [12];
    const saved = makeSaved({ id: "single", name: "Center", cells });
    const def = toPatternDef(saved);
    expect(def.id).toBe("custom:single");
    expect(def.kind).toBe("custom");
    expect(def.name).toBe("Center");
    expect(def.arrangements).toEqual([[12]]);
    expect(def.preview).toEqual([12]);
  });

  it("works with a full 25-cell pattern (maximum cells length)", () => {
    const cells = Array.from({ length: 25 }, (_, i) => i);
    const saved = makeSaved({ id: "full", name: "Cartón lleno", cells });
    const def = toPatternDef(saved);
    expect(def.arrangements).toEqual([cells]);
    expect(def.preview).toEqual(cells);
  });

  it("id prefix 'custom:' cannot collide with a built-in id (no colon in built-in keys)", () => {
    const saved = makeSaved({ id: "line", name: "Línea", cells: [0, 1, 2, 3, 4] });
    expect(toPatternDef(saved).id).toBe("custom:line");
    // The built-in "line" key has no colon, so these are distinct
    expect(toPatternDef(saved).id).not.toBe("line");
  });

  it("does not include a caption field when none is in saved", () => {
    const saved = makeSaved({ id: "nc", name: "No caption", cells: [0] });
    const def = toPatternDef(saved);
    expect("caption" in def).toBe(false);
  });
});
