import { describe, expect, it } from "vitest";
import {
  EXPIRING_WINDOW_DAYS,
  RANKING_WEIGHTS,
  baselineScore,
  isCounting,
  qualityScore,
} from "./ranking";
import type { ScorableSubscription, ReviewStatsLike } from "./ranking";
// App-side mirrors for the cross-mirror drift guard
import {
  DEFAULT_RANKING_WEIGHTS,
  isCountingSubscription,
  scoreBusiness,
  computeSupportSignals,
  qualityScore as appQualityScore,
} from "@/lib/firestore/ranking";
import type { SubscriptionDoc } from "@/types";

// ---------------------------------------------------------------------------
// Shared time anchor so tests are deterministic
// ---------------------------------------------------------------------------
const NOW = 1_700_000_000_000;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function millis(ms: number) {
  return { toMillis: () => ms };
}

/** Build a minimal ScorableSubscription (functions-side type). */
function makeSub(
  overrides: Partial<ScorableSubscription> & { status: string },
): ScorableSubscription {
  return {
    units: 1,
    schoolId: "school-1",
    confirmedAt: millis(NOW - 10 * DAY_MS),
    expiresAt: millis(NOW + 30 * DAY_MS),
    ...overrides,
  };
}

/** Build an app-side SubscriptionDoc (for the cross-mirror tests). */
function makeAppSub(
  overrides: Partial<SubscriptionDoc> & { status: string },
): SubscriptionDoc {
  return {
    schoolId: "school-1",
    businessId: "biz-1",
    units: 1,
    supporterType: "business",
    countsForRanking: true,
    confirmedAt: millis(NOW - 10 * DAY_MS) as unknown as SubscriptionDoc["confirmedAt"],
    expiresAt: millis(NOW + 30 * DAY_MS) as unknown as SubscriptionDoc["expiresAt"],
    ...overrides,
  } as unknown as SubscriptionDoc;
}

// ---------------------------------------------------------------------------
// isCounting
// ---------------------------------------------------------------------------

describe("isCounting", () => {
  it("returns false for pending status", () => {
    expect(isCounting(makeSub({ status: "pending" }), NOW)).toBe(false);
  });

  it("returns false for expired status", () => {
    expect(isCounting(makeSub({ status: "expired" }), NOW)).toBe(false);
  });

  it("returns true for confirmed status with future expiresAt", () => {
    expect(isCounting(makeSub({ status: "confirmed" }), NOW)).toBe(true);
  });

  it("returns true for expiring status with future expiresAt", () => {
    const sub = makeSub({ status: "expiring", expiresAt: millis(NOW + DAY_MS) });
    expect(isCounting(sub, NOW)).toBe(true);
  });

  it("returns false when expiresAt is in the past even if status is stale (not expired)", () => {
    // A subscription whose cron hasn't run yet: status still says "confirmed" but it lapsed
    const sub = makeSub({ status: "confirmed", expiresAt: millis(NOW - 1) });
    expect(isCounting(sub, NOW)).toBe(false);
  });

  it("returns false when expiresAt exactly equals nowMs (expired at this instant)", () => {
    const sub = makeSub({ status: "confirmed", expiresAt: millis(NOW) });
    expect(isCounting(sub, NOW)).toBe(false);
  });

  it("returns true when expiresAt is 1 ms in the future", () => {
    const sub = makeSub({ status: "confirmed", expiresAt: millis(NOW + 1) });
    expect(isCounting(sub, NOW)).toBe(true);
  });

  it("returns true when expiresAt is null (personal donation — no expiry)", () => {
    const sub = makeSub({ status: "confirmed", expiresAt: null });
    expect(isCounting(sub, NOW)).toBe(true);
  });

  it("returns false for expired status even when expiresAt is null", () => {
    const sub = makeSub({ status: "expired", expiresAt: null });
    expect(isCounting(sub, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// qualityScore
// ---------------------------------------------------------------------------

describe("qualityScore", () => {
  it("returns 0 when reviewStats is undefined", () => {
    expect(qualityScore(undefined)).toBe(0);
  });

  it("returns 0 when count is 0", () => {
    expect(qualityScore({ count: 0, average: 5 })).toBe(0);
  });

  it("returns 0 when count is negative", () => {
    expect(qualityScore({ count: -1, average: 5 })).toBe(0);
  });

  it("returns 0 for a 1-star average (minimum)", () => {
    // avgNorm = (1-1)/4 = 0
    expect(qualityScore({ count: 5, average: 1 })).toBe(0);
  });

  it("returns 1 for 5-star average with fully saturated count", () => {
    // reviewSaturationCount = 5; avgNorm = 1, confidence = 1
    expect(qualityScore({ count: 5, average: 5 })).toBe(1);
  });

  it("returns 1 for count above saturationCount (confidence capped at 1)", () => {
    expect(qualityScore({ count: 100, average: 5 })).toBe(1);
  });

  it("scales confidence linearly up to saturationCount", () => {
    // count = 1, saturation = 5 → confidence = 0.2; average 5 → avgNorm 1 → Q = 0.2
    expect(qualityScore({ count: 1, average: 5 })).toBeCloseTo(0.2);
  });

  it("maps average linearly between 1 and 5", () => {
    // average 3 → avgNorm (3-1)/4 = 0.5; count >= 5 → confidence 1 → Q = 0.5
    expect(qualityScore({ count: 5, average: 3 })).toBeCloseTo(0.5);
  });

  it("clamps avgNorm to 0 for average below 1", () => {
    expect(qualityScore({ count: 5, average: 0 })).toBe(0);
  });

  it("clamps avgNorm to 1 for average above 5", () => {
    expect(qualityScore({ count: 5, average: 6 })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// RANKING_WEIGHTS & EXPIRING_WINDOW_DAYS (exported constants)
// ---------------------------------------------------------------------------

describe("RANKING_WEIGHTS", () => {
  it("has all expected keys", () => {
    expect(RANKING_WEIGHTS).toHaveProperty("bc");
    expect(RANKING_WEIGHTS).toHaveProperty("bi");
    expect(RANKING_WEIGHTS).toHaveProperty("bq");
    expect(RANKING_WEIGHTS).toHaveProperty("saturationUnits");
    expect(RANKING_WEIGHTS).toHaveProperty("halfLifeDays");
    expect(RANKING_WEIGHTS).toHaveProperty("reviewSaturationCount");
  });
});

describe("EXPIRING_WINDOW_DAYS", () => {
  it("is a positive integer", () => {
    expect(EXPIRING_WINDOW_DAYS).toBeGreaterThan(0);
    expect(Number.isInteger(EXPIRING_WINDOW_DAYS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// baselineScore
// ---------------------------------------------------------------------------

describe("baselineScore", () => {
  it("returns 1 when there are no subscriptions and no reviews", () => {
    // S = 1 + bi*0 + bq*0 = 1
    expect(baselineScore([], undefined, NOW)).toBe(1);
  });

  it("returns 1 when all subscriptions are non-counting (pending)", () => {
    const subs = [makeSub({ status: "pending", units: 10 })];
    expect(baselineScore(subs, undefined, NOW)).toBe(1);
  });

  it("returns 1 when all subscriptions are expired", () => {
    const subs = [makeSub({ status: "expired", units: 10 })];
    expect(baselineScore(subs, undefined, NOW)).toBe(1);
  });

  it("S = 1 + bi*1 when a single subscription fully saturates (units >= saturationUnits), freshly confirmed", () => {
    // Freshly confirmed (confirmedAt = NOW) → decay = 1.0; units = saturationUnits → saturate = 1
    const subs = [
      makeSub({
        status: "confirmed",
        units: RANKING_WEIGHTS.saturationUnits,
        confirmedAt: millis(NOW),
        expiresAt: millis(NOW + 30 * DAY_MS),
      }),
    ];
    const expected = 1 + RANKING_WEIGHTS.bi * 1;
    expect(baselineScore(subs, undefined, NOW)).toBeCloseTo(expected);
  });

  it("quality contributes via bq when reviews are present", () => {
    const subs: ScorableSubscription[] = [];
    const stats: ReviewStatsLike = { count: 5, average: 5 }; // Q = 1
    const expected = 1 + RANKING_WEIGHTS.bq * 1;
    expect(baselineScore(subs, stats, NOW)).toBeCloseTo(expected);
  });

  it("saturates at saturationUnits so extra units provide no additional score", () => {
    const makeFreshSub = (units: number) =>
      makeSub({
        status: "confirmed",
        units,
        confirmedAt: millis(NOW),
        expiresAt: millis(NOW + 30 * DAY_MS),
      });
    // At saturation (10 units) and above (20 units), score is the same
    const atSaturation = baselineScore([makeFreshSub(RANKING_WEIGHTS.saturationUnits)], undefined, NOW);
    const aboveSaturation = baselineScore([makeFreshSub(RANKING_WEIGHTS.saturationUnits * 2)], undefined, NOW);
    expect(atSaturation).toBeCloseTo(aboveSaturation);
  });

  it("recency decay halves the weight after halfLifeDays", () => {
    const halfLifeMs = RANKING_WEIGHTS.halfLifeDays * DAY_MS;
    const freshSub = makeSub({
      status: "confirmed",
      units: 1,
      confirmedAt: millis(NOW),
      expiresAt: millis(NOW + 400 * DAY_MS),
    });
    const oldSub = makeSub({
      status: "confirmed",
      units: 1,
      confirmedAt: millis(NOW - halfLifeMs),
      expiresAt: millis(NOW + 400 * DAY_MS),
    });
    // Both subscriptions: fresh unit → saturate(1/10) = 0.1; old → saturate(0.5/10) = 0.05
    const freshScore = baselineScore([freshSub], undefined, NOW);
    const oldScore = baselineScore([oldSub], undefined, NOW);
    // The gap should be exactly bi*(0.1 - 0.05)
    const expectedGap = RANKING_WEIGHTS.bi * 0.05;
    expect(freshScore - oldScore).toBeCloseTo(expectedGap, 10);
  });

  it("lapsed subscription (past expiresAt) does not contribute even if status is stale", () => {
    const stale = makeSub({
      status: "confirmed",
      units: RANKING_WEIGHTS.saturationUnits,
      confirmedAt: millis(NOW - 10 * DAY_MS),
      expiresAt: millis(NOW - 1), // lapsed
    });
    expect(baselineScore([stale], undefined, NOW)).toBe(1);
  });

  it("null expiresAt counts as active (personal donation with no expiry)", () => {
    const sub = makeSub({
      status: "confirmed",
      units: RANKING_WEIGHTS.saturationUnits,
      confirmedAt: millis(NOW),
      expiresAt: null,
    });
    const expected = 1 + RANKING_WEIGHTS.bi * 1;
    expect(baselineScore([sub], undefined, NOW)).toBeCloseTo(expected);
  });

  it("accumulates units from multiple counting subscriptions", () => {
    // Two fresh subs of 5 units each → 10 decayed units → saturate = 1 → bi*1
    const subs = [
      makeSub({ status: "confirmed", units: 5, confirmedAt: millis(NOW), expiresAt: millis(NOW + 30 * DAY_MS) }),
      makeSub({ status: "confirmed", units: 5, confirmedAt: millis(NOW), expiresAt: millis(NOW + 30 * DAY_MS) }),
    ];
    const expected = 1 + RANKING_WEIGHTS.bi * 1;
    expect(baselineScore(subs, undefined, NOW)).toBeCloseTo(expected);
  });
});

// ---------------------------------------------------------------------------
// Cross-mirror drift guard: isCounting <-> isCountingSubscription
// ---------------------------------------------------------------------------

describe("isCounting mirrors app isCountingSubscription", () => {
  /**
   * The functions isCounting and the app isCountingSubscription must agree for the
   * general-only case. They use structurally compatible Timestamp shapes, so we build
   * fixtures that satisfy both.
   */
  function toMillisShape(ms: number | null) {
    if (ms == null) return null;
    return { toMillis: () => ms };
  }

  const cases: Array<{
    label: string;
    status: string;
    expiresAtMs: number | null;
  }> = [
    { label: "pending status", status: "pending", expiresAtMs: NOW + 30 * DAY_MS },
    { label: "expired status", status: "expired", expiresAtMs: NOW + 30 * DAY_MS },
    { label: "confirmed with future expiry", status: "confirmed", expiresAtMs: NOW + 30 * DAY_MS },
    { label: "expiring with near-future expiry", status: "expiring", expiresAtMs: NOW + DAY_MS },
    { label: "confirmed with null expiresAt", status: "confirmed", expiresAtMs: null },
    { label: "confirmed but lapsed (stale status)", status: "confirmed", expiresAtMs: NOW - 1 },
    { label: "confirmed with expiresAt exactly nowMs", status: "confirmed", expiresAtMs: NOW },
    { label: "confirmed with expiresAt 1ms in future", status: "confirmed", expiresAtMs: NOW + 1 },
    { label: "expired with null expiresAt", status: "expired", expiresAtMs: null },
  ];

  for (const { label, status, expiresAtMs } of cases) {
    it(`agrees for: ${label}`, () => {
      const fnSub: ScorableSubscription = {
        status,
        units: 1,
        schoolId: "school-1",
        confirmedAt: millis(NOW - DAY_MS),
        expiresAt: toMillisShape(expiresAtMs),
      };
      const appSub = makeAppSub({
        status,
        expiresAt: toMillisShape(expiresAtMs) as unknown as SubscriptionDoc["expiresAt"],
      });

      const fnResult = isCounting(fnSub, NOW);
      const appResult = isCountingSubscription(appSub, NOW);
      expect(fnResult).toBe(appResult);
    });
  }
});

// ---------------------------------------------------------------------------
// Cross-mirror drift guard: baselineScore <-> scoreBusiness (general-only)
// ---------------------------------------------------------------------------

describe("baselineScore mirrors app scoreBusiness for general-only case", () => {
  /**
   * When communitySchoolIds is empty, the app's scoreBusiness (with relevance=1) must
   * equal the functions' baselineScore — they implement the same formula. This guard
   * catches numeric drift between the two copies.
   */

  function makeScenario(units: number, ageMs: number, expiresOffset: number) {
    const confirmedAtMs = NOW - ageMs;
    const expiresAtMs = NOW + expiresOffset;

    const fnSubs: ScorableSubscription[] = [
      {
        status: "confirmed",
        units,
        schoolId: "school-1",
        confirmedAt: millis(confirmedAtMs),
        expiresAt: millis(expiresAtMs),
      },
    ];

    const appSubs: SubscriptionDoc[] = [
      makeAppSub({
        status: "confirmed",
        units,
        schoolId: "school-1",
        confirmedAt: millis(confirmedAtMs) as unknown as SubscriptionDoc["confirmedAt"],
        expiresAt: millis(expiresAtMs) as unknown as SubscriptionDoc["expiresAt"],
        countsForRanking: true,
      }),
    ];

    return { fnSubs, appSubs };
  }

  const scenarios: Array<{ label: string; units: number; ageMs: number; expiresOffset: number; stats?: ReviewStatsLike }> = [
    { label: "fresh subscription, 1 unit, no reviews", units: 1, ageMs: 0, expiresOffset: 30 * DAY_MS },
    {
      label: "saturated subscription (10 units), no reviews",
      units: 10,
      ageMs: 0,
      expiresOffset: 30 * DAY_MS,
    },
    {
      label: "half-life aged subscription (180 days old), 5 units",
      units: 5,
      ageMs: 180 * DAY_MS,
      expiresOffset: 400 * DAY_MS,
    },
    {
      label: "fresh saturated subscription with reviews (Q=1)",
      units: 10,
      ageMs: 0,
      expiresOffset: 30 * DAY_MS,
      stats: { count: 5, average: 5 },
    },
    {
      label: "no subscriptions, good reviews",
      units: 0,
      ageMs: 0,
      expiresOffset: 30 * DAY_MS,
      stats: { count: 3, average: 4 },
    },
  ];

  for (const { label, units, ageMs, expiresOffset, stats } of scenarios) {
    it(`agrees for: ${label}`, () => {
      if (units === 0) {
        // No-subscription case: compare directly
        const fnScore = baselineScore([], stats, NOW);
        const appSignals = computeSupportSignals([], [], DEFAULT_RANKING_WEIGHTS, NOW);
        const appQ = appQualityScore(stats);
        const appScore = scoreBusiness({ relevance: 1, signals: appSignals, quality: appQ });
        expect(fnScore).toBeCloseTo(appScore, 10);
      } else {
        const { fnSubs, appSubs } = makeScenario(units, ageMs, expiresOffset);
        const fnScore = baselineScore(fnSubs, stats, NOW);
        const appSignals = computeSupportSignals(appSubs, [], DEFAULT_RANKING_WEIGHTS, NOW);
        const appQ = appQualityScore(stats);
        const appScore = scoreBusiness({ relevance: 1, signals: appSignals, quality: appQ });
        expect(fnScore).toBeCloseTo(appScore, 10);
      }
    });
  }
});
