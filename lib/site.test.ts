import { describe, expect, it } from "vitest";
import { SITE_URL, absoluteUrl } from "./site";

describe("absoluteUrl", () => {
  it("joins a root-relative path onto the site origin", () => {
    expect(absoluteUrl("/categories")).toBe(`${SITE_URL}/categories`);
  });

  it("handles the root path", () => {
    expect(absoluteUrl("/")).toBe(`${SITE_URL}/`);
  });

  it("preserves deeper paths (e.g. a business profile)", () => {
    expect(absoluteUrl("/business/soda-la-esperanza")).toBe(
      `${SITE_URL}/business/soda-la-esperanza`,
    );
  });
});
