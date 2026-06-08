import { describe, expect, it } from "vitest";
import { queryTerms, relevanceScore } from "./search";

const biz = (over: Partial<Parameters<typeof relevanceScore>[0]> = {}) => ({
  name: "Panadería La Espiga",
  categoryNames: ["Panadería", "Cafetería"],
  description: "Pan artesanal y repostería",
  ...over,
});

describe("queryTerms", () => {
  it("normalizes, splits, and drops short words + stopwords", () => {
    expect(queryTerms("Clases de Inglés")).toEqual(["clases", "ingles"]);
    expect(queryTerms("los panes")).toEqual(["panes"]);
  });

  it("returns [] for empty or all-stopword/short queries", () => {
    expect(queryTerms("")).toEqual([]);
    expect(queryTerms("de la")).toEqual([]);
  });
});

describe("relevanceScore", () => {
  it("scores a name match highest (1)", () => {
    expect(relevanceScore(biz(), "espiga")).toBe(1);
  });

  it("is accent- and case-insensitive", () => {
    expect(relevanceScore(biz(), "PANADERIA")).toBe(1);
  });

  it("scores a category-only match at the category weight", () => {
    const b = biz({ name: "La Espiga", description: "" });
    expect(relevanceScore(b, "cafeteria")).toBeCloseTo(0.8);
  });

  it("scores a description-only match at the description weight", () => {
    const b = biz({ name: "La Espiga", categoryNames: [] });
    expect(relevanceScore(b, "reposteria")).toBeCloseTo(0.5);
  });

  it("averages across terms so partial matches score lower", () => {
    // "espiga" matches name (1), "inexistente" matches nothing (0) -> 0.5
    expect(relevanceScore(biz(), "espiga inexistente")).toBeCloseTo(0.5);
  });

  it("returns 0 when nothing matches (the ranking gate drops it)", () => {
    expect(relevanceScore(biz(), "ferreteria")).toBe(0);
  });

  it("returns 0 for a query with no meaningful terms", () => {
    expect(relevanceScore(biz(), "de la")).toBe(0);
  });
});
