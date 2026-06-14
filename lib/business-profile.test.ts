import { describe, expect, it } from "vitest";
import { validateBusinessProfile } from "./business-profile";

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
