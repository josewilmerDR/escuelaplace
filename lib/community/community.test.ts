import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_UNIT_CRC, TOOL_TYPES } from "@/types";
import { COMMUNITIES, DEFAULT_COMMUNITY_ID } from "./configs";
import { communityEntityLabel, getCurrentCommunity } from "./index";

describe("getCurrentCommunity", () => {
  it("returns the founding community (escuelaplace) by default", () => {
    expect(getCurrentCommunity().id).toBe("escuelaplace");
    expect(DEFAULT_COMMUNITY_ID).toBe("escuelaplace");
  });

  it("registers the default community in the registry", () => {
    expect(COMMUNITIES[DEFAULT_COMMUNITY_ID]).toBeDefined();
  });

  // These lock the ficha to today's hardcoded literals so the later wiring (PR 0.2+) stays
  // behavior-preserving — an accidental drift breaks the test, not production.
  it("mirrors today's identity values exactly", () => {
    const c = getCurrentCommunity();
    expect(c.siteUrl).toBe("https://escuelaplace.com");
    expect(c.wordmark).toEqual({ lead: "escuela", tail: "place" });
    expect(c.colors).toEqual({ brand: "#0ea5e9", brandDark: "#0284c7" });
    expect(c.locale).toBe("es-CR");
    expect(c.brandName).toBe("escuelaplace");
  });

  it("keeps the buyer localStorage key unchanged (PR 0.3 derives it from id)", () => {
    expect(`${getCurrentCommunity().id}.buyer`).toBe("escuelaplace.buyer");
  });

  it("mirrors the support unit constant", () => {
    expect(getCurrentCommunity().subscriptionUnit).toBe(SUBSCRIPTION_UNIT_CRC);
  });

  it("enables every tool kind today (the gating seam is a no-op in PR 0.1)", () => {
    expect([...getCurrentCommunity().enabledTools].sort()).toEqual(
      [...TOOL_TYPES].sort(),
    );
  });

  // PR 0.2 wires app/layout.tsx metadata to these; values must equal the prior literals.
  it("mirrors today's metadata copy exactly", () => {
    const c = getCurrentCommunity();
    expect(c.copy.metaTitle).toBe(
      "escuelaplace — comercios que apoyan a las escuelas de Costa Rica",
    );
    expect(c.copy.metaDescription).toBe(
      "Directorio comunitario que conecta comercios locales con escuelas de Costa Rica. Descubre negocios que apoyan a la escuela de tu comunidad.",
    );
  });
});

describe("communityEntityLabel", () => {
  it("returns the capitalized entity plural for nav chrome (today: Escuelas)", () => {
    expect(communityEntityLabel()).toBe("Escuelas");
  });
});
