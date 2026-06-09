import { describe, expect, it } from "vitest";
import {
  EXPIRING_WINDOW_DAYS,
  RANKING_WEIGHTS as FUNCTIONS_WEIGHTS,
  qualityScore as functionsQualityScore,
} from "../../functions/src/ranking";
import { SUBSCRIPTION_EXPIRING_WINDOW_DAYS } from "@/types";
import type { SubscriptionDoc } from "@/types";
import {
  DEFAULT_RANKING_WEIGHTS,
  computeSupportSignals,
  qualityScore,
  scoreBusiness,
} from "./ranking";

/**
 * Calibration guard. Two jobs:
 * 1. Drift guard — the web app and the Cloud Function each hold their own copy of the
 *    weights (the functions package can't import app code). If they diverge, the stored
 *    baseline and the client re-rank would order differently. Fail loudly.
 * 2. Living spec — the chosen "Balanceado" profile must keep producing the agreed order
 *    for a canonical scenario, computed through the real helpers (not a reimplementation).
 */
const NOW = 1_700_000_000_000;

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as SubscriptionDoc["confirmedAt"];
}

/** Fresh confirmed subscription of `units` to `schoolId` (no decay at NOW). */
function sub(schoolId: string, units: number): SubscriptionDoc {
  return {
    schoolId,
    units,
    status: "confirmed",
    confirmedAt: ts(NOW),
    expiresAt: ts(NOW + 30 * 86_400_000),
  } as unknown as SubscriptionDoc;
}

describe("weight drift guard (app vs Cloud Function)", () => {
  it("the two weight copies are identical", () => {
    expect(FUNCTIONS_WEIGHTS).toEqual(DEFAULT_RANKING_WEIGHTS);
  });

  it("the expiring-window constant matches the type-level source", () => {
    expect(EXPIRING_WINDOW_DAYS).toBe(SUBSCRIPTION_EXPIRING_WINDOW_DAYS);
  });

  it("qualityScore agrees between the app and the Cloud Function", () => {
    for (const stats of [
      { count: 0, average: 0 },
      { count: 1, average: 5 },
      { count: 5, average: 5 },
      { count: 10, average: 3 },
      { count: 3, average: 4.2 },
    ]) {
      expect(functionsQualityScore(stats)).toBeCloseTo(qualityScore(stats));
    }
  });
});

describe("Balanceado profile — canonical ordering", () => {
  const COMMUNITY = ["school-community"];
  // [label, subscriptions, quality]
  const scenario: Array<[string, SubscriptionDoc[], number]> = [
    ["A strong-community", [sub("school-community", 8)], 0.5],
    ["B weak-community", [sub("school-community", 1)], 0.3],
    ["C strong-general", [sub("school-general", 10)], 0.9],
    ["D non-supporter excellent", [], 1.0],
    ["E non-supporter basic", [], 0.0],
  ];

  const scored = scenario
    .map(([label, subs, quality]) => {
      const signals = computeSupportSignals(subs, COMMUNITY, DEFAULT_RANKING_WEIGHTS, NOW);
      return { label, score: scoreBusiness({ relevance: 1, signals, quality }) };
    })
    .sort((a, b) => b.score - a.score);

  it("orders strong-community > strong-general > excellent non-supporter > weak-community > basic", () => {
    expect(scored.map((s) => s.label)).toEqual([
      "A strong-community",
      "C strong-general",
      "D non-supporter excellent",
      "B weak-community",
      "E non-supporter basic",
    ]);
  });

  it("produces the expected scores", () => {
    const byLabel = Object.fromEntries(scored.map((s) => [s.label, s.score]));
    expect(byLabel["A strong-community"]).toBeCloseTo(1.95);
    expect(byLabel["C strong-general"]).toBeCloseTo(1.67);
    expect(byLabel["D non-supporter excellent"]).toBeCloseTo(1.3);
    expect(byLabel["B weak-community"]).toBeCloseTo(1.19);
    expect(byLabel["E non-supporter basic"]).toBeCloseTo(1.0);
  });
});
