import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessDoc, SubscriptionDoc } from "@/types";

// Mock the I/O modules so feed.ts never loads firebase. vi.mock is hoisted above imports.
vi.mock("./subscriptions", () => ({
  getSubscriptionsForBusinesses: vi.fn(),
}));
vi.mock("./geo", () => ({
  getNearbySchoolIds: vi.fn(),
}));

import { getNearbySchoolIds } from "./geo";
import { getSubscriptionsForBusinesses } from "./subscriptions";
import {
  rankBusinessFeed,
  resolveCommunitySchoolIds,
  supportedSchoolsOf,
} from "./feed";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const mockSubs = vi.mocked(getSubscriptionsForBusinesses);
const mockNearby = vi.mocked(getNearbySchoolIds);

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as SubscriptionDoc["confirmedAt"];
}

function biz(id: string, name: string, rankingScore = 0): BusinessDoc {
  return {
    id,
    name,
    ranking: { score: rankingScore, totalDonated: 0 },
  } as unknown as BusinessDoc;
}

function confirmedSub(businessId: string, schoolId: string, units = 2): SubscriptionDoc {
  return {
    id: `${businessId}-${schoolId}`,
    businessId,
    schoolId,
    schoolName: `Escuela ${schoolId}`,
    units,
    status: "confirmed",
    confirmedAt: ts(NOW),
    expiresAt: ts(NOW + 30 * DAY),
  } as unknown as SubscriptionDoc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveCommunitySchoolIds", () => {
  it("unions the chosen school with nearby schools, deduped", async () => {
    mockNearby.mockResolvedValue(["school-near", "school-a"]);
    const ids = await resolveCommunitySchoolIds(
      { schoolId: "school-a", location: { lat: 9.9, lng: -84.1 } },
      5,
    );
    expect(new Set(ids)).toEqual(new Set(["school-a", "school-near"]));
    expect(mockNearby).toHaveBeenCalledWith([9.9, -84.1], 5);
  });

  it("uses only the chosen school when there is no location", async () => {
    const ids = await resolveCommunitySchoolIds({ schoolId: "school-a" });
    expect(ids).toEqual(["school-a"]);
    expect(mockNearby).not.toHaveBeenCalled();
  });

  it("returns an empty community when nothing is known", async () => {
    expect(await resolveCommunitySchoolIds({})).toEqual([]);
  });
});

describe("rankBusinessFeed — explore mode", () => {
  it("orders community supporters, then general, then non-supporters, with tiers", async () => {
    const businesses = [biz("b3", "C"), biz("b2", "B"), biz("b1", "A")];
    mockSubs.mockResolvedValue([
      confirmedSub("b1", "school-a"), // community
      confirmedSub("b2", "school-x"), // general
      // b3: no support
    ]);

    const ranked = await rankBusinessFeed(businesses, {
      communitySchoolIds: ["school-a"],
      nowMs: NOW,
    });

    expect(ranked.map((r) => r.business.id)).toEqual(["b1", "b2", "b3"]);
    expect(ranked.map((r) => r.tier)).toEqual(["community", "general", "none"]);
    expect(ranked.every((r) => r.relevance === 1)).toBe(true);
  });

  it("keeps non-supporters visible (the ramp), never dropping them", async () => {
    const businesses = [biz("b1", "A")];
    mockSubs.mockResolvedValue([]);
    const ranked = await rankBusinessFeed(businesses, {
      communitySchoolIds: [],
      nowMs: NOW,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ tier: "none", score: 1 });
  });

  it("breaks ties by stored ranking.score then name", async () => {
    // Two non-supporters tie on score (1.0); higher stored ranking.score wins.
    const businesses = [biz("low", "Zeta", 1), biz("high", "Alpha", 9)];
    mockSubs.mockResolvedValue([]);
    const ranked = await rankBusinessFeed(businesses, {
      communitySchoolIds: [],
      nowMs: NOW,
    });
    expect(ranked.map((r) => r.business.id)).toEqual(["high", "low"]);
  });
});

describe("supportedSchoolsOf", () => {
  function sub(schoolId: string, units: number, confirmedMs = NOW): SubscriptionDoc {
    return {
      id: `s-${schoolId}-${units}`,
      businessId: "b1",
      schoolId,
      schoolName: `Escuela ${schoolId}`,
      units,
      status: "confirmed",
      confirmedAt: ts(confirmedMs),
      expiresAt: ts(NOW + 30 * DAY),
    } as unknown as SubscriptionDoc;
  }

  it("puts community schools first, then ranks the rest by support magnitude", () => {
    const result = supportedSchoolsOf(
      [sub("general-weak", 1), sub("general-strong", 9), sub("home", 1)],
      ["home"],
      NOW,
    );
    expect(result.map((s) => s.id)).toEqual([
      "home", // community always leads
      "general-strong", // then by decayed units
      "general-weak",
    ]);
    expect(result[0].name).toBe("Escuela home");
  });

  it("collapses multiple subscriptions to one school into a single entry", () => {
    const result = supportedSchoolsOf([sub("a", 3), sub("a", 4), sub("b", 5)], [], NOW);
    expect(result.map((s) => s.id)).toEqual(["a", "b"]); // a's 3+4=7 > b's 5
  });

  it("excludes pending and lapsed subscriptions", () => {
    const pending = { ...sub("p", 9), status: "pending" } as SubscriptionDoc;
    const lapsed = { ...sub("l", 9), expiresAt: ts(NOW - DAY) } as SubscriptionDoc;
    expect(supportedSchoolsOf([pending, lapsed, sub("ok", 1)], [], NOW)).toEqual([
      { id: "ok", name: "Escuela ok" },
    ]);
  });
});

describe("rankBusinessFeed — search mode", () => {
  it("drops businesses with relevance 0 (mission never surfaces irrelevant)", async () => {
    const businesses = [biz("b1", "A"), biz("b2", "B")];
    mockSubs.mockResolvedValue([confirmedSub("b2", "school-a", 10)]); // b2 supports a lot
    const ranked = await rankBusinessFeed(businesses, {
      communitySchoolIds: ["school-a"],
      relevanceById: { b1: 0.9, b2: 0 }, // b2 irrelevant despite strong support
      nowMs: NOW,
    });
    expect(ranked.map((r) => r.business.id)).toEqual(["b1"]);
  });

  it("orders relevant results by relevance gated then mission boost", async () => {
    const businesses = [biz("b1", "A"), biz("b2", "B")];
    // Equal relevance; b2 supports the community so its mission boost wins.
    mockSubs.mockResolvedValue([confirmedSub("b2", "school-a", 10)]);
    const ranked = await rankBusinessFeed(businesses, {
      communitySchoolIds: ["school-a"],
      relevanceById: new Map([
        ["b1", 0.8],
        ["b2", 0.8],
      ]),
      nowMs: NOW,
    });
    expect(ranked.map((r) => r.business.id)).toEqual(["b2", "b1"]);
  });
});
