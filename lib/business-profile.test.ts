import { describe, expect, it } from "vitest";
import { BUSINESS_TAGS_MAX } from "@/types";
import { normalizeTags, validateBusinessProfile } from "./business-profile";

describe("normalizeTags", () => {
  it("trims, collapses inner whitespace, and drops empties", () => {
    expect(normalizeTags(["  cuadernos  ", "útiles   escolares", "  ", ""])).toEqual([
      "cuadernos",
      "útiles escolares",
    ]);
  });

  it("de-duplicates case/accent-insensitively, keeping the first casing", () => {
    expect(normalizeTags(["Cuadernos", "cuadernos", "CUÁDERNOS"])).toEqual([
      "Cuadernos",
    ]);
  });

  it("caps the count at BUSINESS_TAGS_MAX", () => {
    const many = Array.from({ length: BUSINESS_TAGS_MAX + 5 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(BUSINESS_TAGS_MAX);
  });

  it("truncates an over-long tag", () => {
    const [tag] = normalizeTags(["x".repeat(80)]);
    expect(tag.length).toBe(50);
  });
});

describe("validateBusinessProfile", () => {
  it("rejects an empty category list first", () => {
    expect(
      validateBusinessProfile({ categories: [], hasCoords: true }),
    ).toMatch(/categoría/i);
  });

  it("flags the missing category even when coords are also missing (top-down order)", () => {
    expect(
      validateBusinessProfile({ categories: [], hasCoords: false }),
    ).toMatch(/categoría/i);
  });

  it("rejects a missing map pin once a category is set", () => {
    expect(
      validateBusinessProfile({ categories: ["cat1"], hasCoords: false }),
    ).toMatch(/ubicación/i);
  });

  it("returns null when a category and coords are present", () => {
    expect(
      validateBusinessProfile({ categories: ["cat1"], hasCoords: true }),
    ).toBeNull();
  });
});
