import { describe, expect, it } from "vitest";
import {
  DONOR_TIER_MIN_UNITS as FUNCTIONS_TIER_MIN_UNITS,
  donorTierForUnits as functionsDonorTierForUnits,
} from "../../functions/src/donors";
import { DONOR_TIER_MIN_UNITS, donorTierForUnits } from "./donors";

describe("donorTierForUnits", () => {
  it("returns null below the first threshold", () => {
    expect(donorTierForUnits(0)).toBeNull();
    expect(donorTierForUnits(-3)).toBeNull();
  });

  it("grants bronze from the very first confirmed unit", () => {
    expect(donorTierForUnits(1)).toBe("bronze");
  });

  it("maps each threshold boundary to its tier", () => {
    expect(donorTierForUnits(5)).toBe("bronze");
    expect(donorTierForUnits(6)).toBe("silver");
    expect(donorTierForUnits(25)).toBe("silver");
    expect(donorTierForUnits(26)).toBe("gold");
    expect(donorTierForUnits(100)).toBe("gold");
    expect(donorTierForUnits(101)).toBe("platinum");
    expect(donorTierForUnits(10_000)).toBe("platinum");
  });

  it("keeps thresholds strictly increasing (sane config guard)", () => {
    expect(DONOR_TIER_MIN_UNITS.bronze).toBeLessThan(DONOR_TIER_MIN_UNITS.silver);
    expect(DONOR_TIER_MIN_UNITS.silver).toBeLessThan(DONOR_TIER_MIN_UNITS.gold);
    expect(DONOR_TIER_MIN_UNITS.gold).toBeLessThan(DONOR_TIER_MIN_UNITS.platinum);
  });
});

describe("tier drift guard (app vs Cloud Function)", () => {
  // The functions package can't import app code, so it holds its own copy of the
  // thresholds. If the copies diverge, the function would persist a tier the web UI
  // disagrees with. Fail loudly — same pattern as the ranking-weight drift guard.
  it("the two threshold copies are identical", () => {
    expect(FUNCTIONS_TIER_MIN_UNITS).toEqual(DONOR_TIER_MIN_UNITS);
  });

  it("the tier mapping agrees across the boundary values", () => {
    for (const units of [0, 1, 5, 6, 25, 26, 100, 101, 500]) {
      expect(functionsDonorTierForUnits(units)).toBe(donorTierForUnits(units));
    }
  });
});
