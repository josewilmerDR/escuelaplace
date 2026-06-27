import { describe, expect, it } from "vitest";
import {
  formatBingoSummary,
  formatColones,
  formatDate,
  formatDateTime,
  formatDaysAgo,
  formatMoney,
  formatRating,
  formatApproxDuration,
  pluralizeBusinesses,
} from "./format";
import { capitalizeFirst } from "./metrics";

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

describe("formatRating", () => {
  it("always shows exactly one decimal (Costa Rica comma)", () => {
    expect(formatRating(4.5)).toContain("4,5");
    expect(formatRating(5)).toBe("5,0");
    expect(formatRating(0)).toBe("0,0");
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

describe("formatBingoSummary", () => {
  it("renders grid and number pool as 'rows×cols · min–max'", () => {
    expect(formatBingoSummary({ rows: 5, cols: 5, poolMin: 0, poolMax: 75 })).toBe(
      "5×5 · 0–75",
    );
    expect(formatBingoSummary({ rows: 3, cols: 9, poolMin: 1, poolMax: 90 })).toBe(
      "3×9 · 1–90",
    );
  });
});

const HOUR_MS = 3_600_000;

describe("formatColones", () => {
  it("formats zero with the colón symbol and no fraction digits", () => {
    expect(formatColones(0)).toBe("₡0");
  });

  it("formats a four-digit amount using es-CR narrow space grouping", () => {
    // 5000 -> "₡5 000" (narrow no-break space between groups per es-CR locale)
    expect(formatColones(5000)).toBe("₡5 000");
  });

  it("formats a one-million amount with two grouping separators", () => {
    expect(formatColones(1_000_000)).toBe("₡1 000 000");
  });

  it("formats a single colón without grouping", () => {
    expect(formatColones(1)).toBe("₡1");
  });
});

describe("formatMoney", () => {
  it("formats CRC the same as formatColones", () => {
    expect(formatMoney(5000, "CRC")).toBe(formatColones(5000));
  });

  it("formats USD using the es-CR locale (symbol ISO code prefix)", () => {
    const result = formatMoney(100, "USD");
    expect(result).toContain("100");
    expect(result.toUpperCase()).toContain("USD");
  });

  it("formats EUR with es-CR locale grouping", () => {
    const result = formatMoney(1000, "EUR");
    expect(result).toContain("1");
    expect(result.toUpperCase()).toContain("EUR");
  });

  it("falls back to '<code> <amount>' for an unrecognized/invalid currency code", () => {
    // A code longer than 3 chars throws RangeError in V8's Intl implementation
    expect(formatMoney(500, "INVALID_CODE_TOO_LONG")).toBe(
      "INVALID_CODE_TOO_LONG 500"
    );
  });
});

describe("formatApproxDuration", () => {
  it("returns 'menos de 1 hora' for zero ms", () => {
    expect(formatApproxDuration(0)).toBe("menos de 1 hora");
  });

  it("returns 'menos de 1 hora' for any value strictly below one hour", () => {
    expect(formatApproxDuration(HOUR_MS - 1)).toBe("menos de 1 hora");
  });

  it("returns '1 hora' for exactly one hour", () => {
    expect(formatApproxDuration(HOUR_MS)).toBe("1 hora");
  });

  it("returns the plural for N hours (2 hours example)", () => {
    expect(formatApproxDuration(2 * HOUR_MS)).toBe("2 horas");
  });

  it("returns plural hours for a multi-hour value below one day (23 h)", () => {
    expect(formatApproxDuration(23 * HOUR_MS)).toBe("23 horas");
  });

  it("switches to '1 día' at the hour/day boundary (23.5 h rounds to 24 h -> 1 day)", () => {
    // Math.round(23.5 * HOUR_MS / HOUR_MS) = 24, which is NOT < 24, so the
    // function proceeds to the day branch: Math.round(23.5 / 24) = 1 -> "1 día"
    expect(formatApproxDuration(23.5 * HOUR_MS)).toBe("1 día");
  });

  it("returns '1 día' for exactly one day", () => {
    expect(formatApproxDuration(24 * HOUR_MS)).toBe("1 día");
  });

  it("returns '2 días' for 36 hours (1.5 days rounds to 2)", () => {
    expect(formatApproxDuration(36 * HOUR_MS)).toBe("2 días");
  });

  it("returns plural días for values well beyond one day", () => {
    expect(formatApproxDuration(5 * 24 * HOUR_MS)).toBe("5 días");
  });
});

describe("formatDate", () => {
  it("renders the calendar day in UTC regardless of offset arithmetic", () => {
    // June 25 2026 at UTC midnight should render as '25 jun 2026' on any host timezone
    const utcJun25 = Date.UTC(2026, 5, 25); // month is 0-indexed
    expect(formatDate(utcJun25)).toBe("25 jun 2026");
  });

  it("still renders the preceding day one millisecond before midnight UTC", () => {
    const utcJun25 = Date.UTC(2026, 5, 25);
    expect(formatDate(utcJun25 - 1)).toBe("24 jun 2026");
  });

  it("renders January correctly (different month abbreviation)", () => {
    const utcJan1 = Date.UTC(2026, 0, 1);
    expect(formatDate(utcJan1)).toBe("1 ene 2026");
  });
});

describe("formatDateTime", () => {
  it("returns a string that contains the year and minute portions", () => {
    // formatDateTime uses local time; we can only assert structure, not exact value
    const ms = Date.UTC(2026, 5, 15, 12, 0); // some fixed instant
    const result = formatDateTime(ms);
    expect(result).toContain("2026");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the numeric day portion in the output", () => {
    const ms = Date.UTC(2026, 5, 15, 12, 0);
    const result = formatDateTime(ms);
    // The day (15) must appear somewhere in the formatted string
    expect(result).toMatch(/15/);
  });
});

describe("capitalizeFirst", () => {
  it("returns an empty string unchanged", () => {
    expect(capitalizeFirst("")).toBe("");
  });

  it("uppercases only the first character, leaving the rest untouched", () => {
    expect(capitalizeFirst("hello")).toBe("Hello");
    // Existing uppercase letters in the rest must NOT be lowercased
    expect(capitalizeFirst("hELLO")).toBe("HELLO");
  });

  it("leaves an already-uppercase first character unchanged", () => {
    expect(capitalizeFirst("HELLO")).toBe("HELLO");
  });

  it("works for a single-character string", () => {
    expect(capitalizeFirst("a")).toBe("A");
  });
});
