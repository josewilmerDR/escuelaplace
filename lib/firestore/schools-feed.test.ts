import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHOOL_WEIGHTS,
  type RankableSchool,
  rankSchoolsByRelevance,
  schoolActivityScore,
  schoolProximityScore,
} from "./schools-feed";

describe("schoolActivityScore", () => {
  it("is 0 with no counted supporters", () => {
    expect(schoolActivityScore({})).toBe(0);
    expect(schoolActivityScore({ supportingBusinesses: 0, uniqueSupporters: 0 })).toBe(0);
  });

  it("uses the distinct-supporter count, not a sum (uniqueSupporters already includes businesses)", () => {
    // uniqueSupporters (6) is the superset; saturating at 12 → 0.5. It must NOT be summed
    // with supportingBusinesses (which it already counts) — that would double-count.
    expect(
      schoolActivityScore({ supportingBusinesses: 4, uniqueSupporters: 6 }),
    ).toBeCloseTo(0.5);
  });

  it("falls back to supportingBusinesses on legacy docs without uniqueSupporters", () => {
    // 6 supporting businesses, no uniqueSupporters field → 6/12 = 0.5.
    expect(schoolActivityScore({ supportingBusinesses: 6 })).toBeCloseTo(0.5);
  });

  it("saturates at 1 (bounded advantage)", () => {
    expect(
      schoolActivityScore({ supportingBusinesses: 50, uniqueSupporters: 80 }),
    ).toBe(1);
  });
});

describe("schoolProximityScore", () => {
  it("is 0 when the distance is unknown", () => {
    expect(schoolProximityScore(null)).toBe(0);
  });

  it("is 1 at zero distance and halves every half-life", () => {
    const { proximityHalfLifeKm: hl } = DEFAULT_SCHOOL_WEIGHTS;
    expect(schoolProximityScore(0)).toBe(1);
    expect(schoolProximityScore(hl)).toBeCloseTo(0.5);
    expect(schoolProximityScore(2 * hl)).toBeCloseTo(0.25);
  });

  it("decreases monotonically with distance", () => {
    expect(schoolProximityScore(1)).toBeGreaterThan(schoolProximityScore(3));
    expect(schoolProximityScore(3)).toBeGreaterThan(schoolProximityScore(20));
  });
});

describe("rankSchoolsByRelevance", () => {
  // San José center; a far school sits ~150 km away in Guanacaste.
  const center = { lat: 9.9333, lng: -84.0833 };

  const near: RankableSchool = {
    id: "near",
    name: "Cercana",
    lat: center.lat,
    lng: center.lng,
    supportingBusinesses: 0,
    uniqueSupporters: 0,
  };
  const farActive: RankableSchool = {
    id: "far",
    name: "Lejana activa",
    lat: 10.6333,
    lng: -85.4408,
    supportingBusinesses: 50,
    uniqueSupporters: 50,
  };

  it("with no location, falls back to activity order (not alphabetical)", () => {
    // Alphabetically "Aurora" (dormant) would lead; activity must reorder it last.
    const aurora: RankableSchool = { id: "a", name: "Aurora", uniqueSupporters: 0 };
    const busy: RankableSchool = { id: "b", name: "Zedillo", uniqueSupporters: 8 };
    const order = rankSchoolsByRelevance([aurora, busy]).map((r) => r.school.id);
    expect(order).toEqual(["b", "a"]);
  });

  it("breaks ties by name when activity is equal and no location", () => {
    const beta: RankableSchool = { id: "beta", name: "Beta", uniqueSupporters: 2 };
    const alfa: RankableSchool = { id: "alfa", name: "Alfa", uniqueSupporters: 2 };
    const order = rankSchoolsByRelevance([beta, alfa]).map((r) => r.school.id);
    expect(order).toEqual(["alfa", "beta"]);
  });

  it("leads with proximity: a nearby dormant school beats a far very active one", () => {
    const order = rankSchoolsByRelevance([farActive, near], {
      location: center,
    }).map((r) => r.school.id);
    expect(order[0]).toBe("near");
  });

  it("exposes the computed distance and orders the near school first", () => {
    const ranked = rankSchoolsByRelevance([farActive, near], { location: center });
    const byId = Object.fromEntries(ranked.map((r) => [r.school.id, r]));
    expect(byId.near.distanceKm).toBeCloseTo(0, 1);
    expect(byId.far.distanceKm).toBeGreaterThan(100);
    expect(ranked[0].school.id).toBe("near");
  });

  it("treats a school without a geopoint as proximity 0 (distance null)", () => {
    const noPin: RankableSchool = {
      id: "nopin",
      name: "Sin pin",
      lat: null,
      lng: null,
      uniqueSupporters: 6,
    };
    const ranked = rankSchoolsByRelevance([noPin, near], { location: center });
    const byId = Object.fromEntries(ranked.map((r) => [r.school.id, r]));
    expect(byId.nopin.distanceKm).toBeNull();
    // Near (proximity 1 → 1.0) still beats an active-but-unlocatable school (0.4·0.5 = 0.2).
    expect(ranked[0].school.id).toBe("near");
  });

  it("uses the verified bonus as a tie-breaker at equal proximity and activity", () => {
    const plain: RankableSchool = { id: "plain", name: "Aaa", lat: 1, lng: 1, verified: false };
    const trusted: RankableSchool = { id: "trusted", name: "Zzz", lat: 1, lng: 1, verified: true };
    const order = rankSchoolsByRelevance([plain, trusted], {
      location: { lat: 1, lng: 1 },
    }).map((r) => r.school.id);
    expect(order).toEqual(["trusted", "plain"]);
  });
});
