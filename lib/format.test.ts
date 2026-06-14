import { describe, expect, it } from "vitest";
import { formatDaysAgo, pluralizeBusinesses } from "./format";

const DAY_MS = 86_400_000;

describe("formatDaysAgo", () => {
  it("reads sub-day and negative (clock skew) ages as 'hoy'", () => {
    expect(formatDaysAgo(0)).toBe("hoy");
    expect(formatDaysAgo(DAY_MS - 1)).toBe("hoy");
    expect(formatDaysAgo(-DAY_MS)).toBe("hoy");
  });

  it("uses 'ayer' for the second day", () => {
    expect(formatDaysAgo(DAY_MS)).toBe("ayer");
    expect(formatDaysAgo(2 * DAY_MS - 1)).toBe("ayer");
  });

  it("floors to whole days beyond that", () => {
    expect(formatDaysAgo(2 * DAY_MS)).toBe("hace 2 días");
    expect(formatDaysAgo(9 * DAY_MS + 1)).toBe("hace 9 días");
  });
});

describe("pluralizeBusinesses", () => {
  it("uses the singular only for exactly one", () => {
    expect(pluralizeBusinesses(1)).toBe("1 comercio");
  });

  it("uses the plural for zero and counts above one", () => {
    expect(pluralizeBusinesses(0)).toBe("0 comercios");
    expect(pluralizeBusinesses(2)).toBe("2 comercios");
  });

  it("treats a missing count (legacy docs) as zero", () => {
    expect(pluralizeBusinesses(undefined)).toBe("0 comercios");
  });
});
