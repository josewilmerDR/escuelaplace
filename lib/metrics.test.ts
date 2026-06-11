import { describe, expect, it } from "vitest";
import {
  crDayKey,
  monthLabel,
  monthRange,
  previousMonthRange,
  summarizeDailyMetrics,
} from "./metrics";

describe("crDayKey", () => {
  it("uses Costa Rica time, not UTC", () => {
    // 2026-06-10 03:00 UTC is still 2026-06-09 21:00 in Costa Rica (UTC-6).
    expect(crDayKey(Date.UTC(2026, 5, 10, 3, 0))).toBe("2026-06-09");
    // Midday UTC is the same calendar day in Costa Rica.
    expect(crDayKey(Date.UTC(2026, 5, 10, 12, 0))).toBe("2026-06-10");
  });
});

describe("monthRange", () => {
  it("covers the month the day belongs to", () => {
    expect(monthRange("2026-06-10")).toEqual({
      from: "2026-06-01",
      to: "2026-06-31",
      month: "2026-06",
    });
  });
});

describe("previousMonthRange", () => {
  it("steps one month back", () => {
    expect(previousMonthRange("2026-06-10").month).toBe("2026-05");
  });

  it("crosses year boundaries", () => {
    expect(previousMonthRange("2026-01-15").month).toBe("2025-12");
  });
});

describe("summarizeDailyMetrics", () => {
  it("sums views, walk-ins and per-channel clicks across days", () => {
    const summary = summarizeDailyMetrics([
      { views: 10, clicks: { whatsapp: 2, directions: 1 }, walkIns: 2 },
      { views: 5, clicks: { whatsapp: 3 } },
      { clicks: { phone: 1 }, walkIns: 1 },
      {},
    ]);
    expect(summary).toEqual({
      views: 15,
      contacts: 7,
      walkIns: 3,
      byChannel: { whatsapp: 5, directions: 1, phone: 1 },
    });
  });

  it("returns zeros for an empty period", () => {
    expect(summarizeDailyMetrics([])).toEqual({
      views: 0,
      contacts: 0,
      walkIns: 0,
      byChannel: {},
    });
  });
});

describe("monthLabel", () => {
  it("renders the Spanish month name and year", () => {
    const label = monthLabel("2026-06");
    expect(label).toContain("junio");
    expect(label).toContain("2026");
  });
});
