import { describe, expect, it } from "vitest";
import { slugify } from "./businesses";

describe("slugify", () => {
  it("lowercases the name", () => {
    expect(slugify("HolaMundo")).toBe("holamundo");
  });

  it("strips NFD accent marks from vowels", () => {
    expect(slugify("café")).toBe("cafe");
    expect(slugify("Ángela")).toBe("angela");
    expect(slugify("niño")).toBe("nino");
    expect(slugify("corazón")).toBe("corazon");
    expect(slugify("güero")).toBe("guero");
  });

  it("replaces a single non-alphanumeric character with a hyphen", () => {
    expect(slugify("hello world")).toBe("hello-world");
    expect(slugify("a&b")).toBe("a-b");
  });

  it("collapses consecutive non-alphanumeric characters into one hyphen", () => {
    expect(slugify("hello   world")).toBe("hello-world");
    expect(slugify("foo---bar")).toBe("foo-bar");
    expect(slugify("a  &  b")).toBe("a-b");
  });

  it("trims leading hyphens", () => {
    expect(slugify("!hello")).toBe("hello");
    expect(slugify("---hello")).toBe("hello");
  });

  it("trims trailing hyphens", () => {
    expect(slugify("hello!")).toBe("hello");
    expect(slugify("hello---")).toBe("hello");
  });

  it("trims both leading and trailing hyphens", () => {
    expect(slugify("!hello!")).toBe("hello");
  });

  it("handles a typical business name with spaces and accents", () => {
    expect(slugify("Soda La Esperanza")).toBe("soda-la-esperanza");
    expect(slugify("Panadería El Buen Pan")).toBe("panaderia-el-buen-pan");
  });

  it("returns empty string for a name that is all punctuation", () => {
    // The caller (uniqueBusinessSlug) falls back to 'comercio' when this returns ''
    expect(slugify("!!!")).toBe("");
    expect(slugify("---")).toBe("");
    expect(slugify("@#$%")).toBe("");
  });

  it("returns empty string for an empty string input", () => {
    expect(slugify("")).toBe("");
  });

  it("preserves digits", () => {
    expect(slugify("Comercio 2025")).toBe("comercio-2025");
    expect(slugify("123abc")).toBe("123abc");
  });

  it("handles a name that is already URL-safe", () => {
    expect(slugify("hello-world")).toBe("hello-world");
  });

  it("handles mixed case with accents and special characters", () => {
    // The apostrophe in "José's" is a non-alphanumeric char and becomes a hyphen separator,
    // so "José's" → "jose-s" (not "joses"). Ampersand and spaces also collapse to one hyphen.
    expect(slugify("José's Café & Bar")).toBe("jose-s-cafe-bar");
  });

  it("handles unicode punctuation that is not a latin accent", () => {
    expect(slugify("hello…world")).toBe("hello-world");
  });

  it("handles a single alphanumeric character", () => {
    expect(slugify("a")).toBe("a");
    expect(slugify("1")).toBe("1");
  });

  it("handles whitespace-only input", () => {
    expect(slugify("   ")).toBe("");
  });
});
