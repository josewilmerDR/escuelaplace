import { describe, expect, it } from "vitest";
import type { SubscriptionDoc } from "@/types";
import {
  DEFAULT_RANKING_WEIGHTS,
  type RankingWeights,
  computeSupportSignals,
  isCountingSubscription,
  qualityScore,
  scoreBusiness,
} from "./ranking";

const NOW = 1_700_000_000_000; // fixed clock (ms)
const DAY = 86_400_000;

/** Minimal fake Timestamp: only `toMillis` is used by the helpers. */
function ts(ms: number) {
  return { toMillis: () => ms } as unknown as SubscriptionDoc["confirmedAt"];
}

/** Build a subscription doc with sensible defaults for ranking tests. */
function sub(overrides: Partial<SubscriptionDoc> = {}): SubscriptionDoc {
  return {
    id: "s1",
    businessId: "b1",
    businessName: "B",
    schoolId: "school-a",
    schoolName: "A",
    units: 1,
    amount: 5000,
    status: "confirmed",
    confirmedAt: ts(NOW),
    expiresAt: ts(NOW + 30 * DAY),
    createdAt: ts(NOW),
    updatedAt: ts(NOW),
    ...overrides,
  } as SubscriptionDoc;
}

describe("isCountingSubscription", () => {
  it("counts confirmed and expiring subscriptions that have not lapsed", () => {
    expect(isCountingSubscription(sub({ status: "confirmed" }), NOW)).toBe(true);
    expect(isCountingSubscription(sub({ status: "expiring" }), NOW)).toBe(true);
  });

  it("never counts pending or expired", () => {
    expect(isCountingSubscription(sub({ status: "pending" }), NOW)).toBe(false);
    expect(isCountingSubscription(sub({ status: "expired" }), NOW)).toBe(false);
  });

  it("treats a lapsed expiresAt as non-counting even if status is stale", () => {
    // status still says confirmed (no cron has run), but it expired yesterday.
    const lapsed = sub({ status: "confirmed", expiresAt: ts(NOW - DAY) });
    expect(isCountingSubscription(lapsed, NOW)).toBe(false);
  });

  it("counts when expiresAt is null (no expiry set)", () => {
    expect(isCountingSubscription(sub({ expiresAt: null }), NOW)).toBe(true);
  });
});

describe("computeSupportSignals", () => {
  it("splits support into community vs general by school id", () => {
    const subs = [
      sub({ schoolId: "school-a", units: 2 }),
      sub({ schoolId: "school-x", units: 2 }),
    ];
    const signals = computeSupportSignals(subs, ["school-a"], DEFAULT_RANKING_WEIGHTS, NOW);
    // confirmedAt == NOW => no decay => raw units pass through.
    expect(signals.raw.community).toBeCloseTo(2);
    expect(signals.raw.general).toBeCloseTo(2);
  });

  it("ignores non-counting subscriptions", () => {
    const subs = [
      sub({ schoolId: "school-a", units: 5, status: "pending" }),
      sub({ schoolId: "school-a", units: 5, status: "expired" }),
    ];
    const signals = computeSupportSignals(subs, ["school-a"], DEFAULT_RANKING_WEIGHTS, NOW);
    expect(signals.community).toBe(0);
    expect(signals.raw.community).toBe(0);
  });

  it("saturates the signal into [0,1] (bounded advantage)", () => {
    const weights: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, saturationUnits: 10 };
    const huge = [sub({ schoolId: "school-a", units: 1000 })];
    const signals = computeSupportSignals(huge, ["school-a"], weights, NOW);
    expect(signals.community).toBe(1);
    expect(signals.raw.community).toBe(1000); // raw is uncapped for debugging
  });

  it("applies recency decay: support one half-life old weighs half", () => {
    const weights: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, halfLifeDays: 180 };
    const old = [
      sub({
        schoolId: "school-a",
        units: 4,
        confirmedAt: ts(NOW - 180 * DAY),
        expiresAt: ts(NOW + DAY), // still counting
      }),
    ];
    const signals = computeSupportSignals(old, ["school-a"], weights, NOW);
    expect(signals.raw.community).toBeCloseTo(2); // 4 * 0.5
  });

  it("returns zero signals when there is no community and no support", () => {
    const signals = computeSupportSignals([], [], DEFAULT_RANKING_WEIGHTS, NOW);
    expect(signals).toMatchObject({ community: 0, general: 0 });
  });
});

describe("scoreBusiness", () => {
  const weights = DEFAULT_RANKING_WEIGHTS;
  const noSupport = { community: 0, general: 0, raw: { community: 0, general: 0 } };

  it("is the multiplicative formula S = R * (1 + bc*C + bi*I + bq*Q)", () => {
    const signals = { community: 0.5, general: 0.25, raw: { community: 0, general: 0 } };
    const s = scoreBusiness({ relevance: 1, signals, quality: 0.2 }, weights);
    const expected =
      1 * (1 + weights.bc * 0.5 + weights.bi * 0.25 + weights.bq * 0.2);
    expect(s).toBeCloseTo(expected);
  });

  it("relevance is a multiplicative gate: R = 0 collapses the score", () => {
    const strong = { community: 1, general: 1, raw: { community: 0, general: 0 } };
    expect(scoreBusiness({ relevance: 0, signals: strong }, weights)).toBe(0);
  });

  it("a non-supporter in explore mode scores the baseline 1", () => {
    expect(scoreBusiness({ relevance: 1, signals: noSupport }, weights)).toBe(1);
  });

  it("community support outranks equal general support (bc > bi)", () => {
    const community = { community: 1, general: 0, raw: { community: 0, general: 0 } };
    const general = { community: 0, general: 1, raw: { community: 0, general: 0 } };
    expect(scoreBusiness({ relevance: 1, signals: community }, weights)).toBeGreaterThan(
      scoreBusiness({ relevance: 1, signals: general }, weights),
    );
  });
});

describe("qualityScore", () => {
  it("is 0 with no reviews", () => {
    expect(qualityScore({ count: 0, average: 0 })).toBe(0);
    expect(qualityScore(undefined)).toBe(0);
  });

  it("maps the mean rating 1★→0, 5★→1 at full confidence", () => {
    // 5 reviews = full confidence with the default reviewSaturationCount.
    expect(qualityScore({ count: 5, average: 5 })).toBeCloseTo(1);
    expect(qualityScore({ count: 5, average: 1 })).toBeCloseTo(0);
    expect(qualityScore({ count: 5, average: 3 })).toBeCloseTo(0.5);
  });

  it("discounts few reviews via the confidence factor", () => {
    // 1 of 5 reviews → confidence 0.2, so a lone 5★ gives Q = 0.2, not 1.
    expect(qualityScore({ count: 1, average: 5 })).toBeCloseTo(0.2);
  });
});
