/**
 * Pure helpers for the business funnel report (panel): month windows over the
 * metricsDaily series and aggregation of its daily docs.
 *
 * Day keys are YYYY-MM-DD in Costa Rica time (fixed UTC-6 — no DST there), mirroring
 * crDayKey in functions/src/track.ts, which writes the series.
 */
import type { BusinessDailyMetrics, ContactChannel } from "@/types";

const CR_UTC_OFFSET_MS = 6 * 3_600_000;

/** Day key (YYYY-MM-DD) of an instant, in Costa Rica time. */
export function crDayKey(nowMs: number): string {
  return new Date(nowMs - CR_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Inclusive day-key range covering one calendar month, for doc-id range queries. */
export interface DayRange {
  from: string;
  to: string;
  /** "YYYY-MM", for labeling. */
  month: string;
}

/**
 * The month a given day belongs to. `to` is day 31 for every month: it is only a
 * lexicographic upper bound for the range query — day keys that don't exist simply
 * match nothing.
 */
export function monthRange(dayKey: string): DayRange {
  const month = dayKey.slice(0, 7);
  return { from: `${month}-01`, to: `${month}-31`, month };
}

/** The month before the one a given day belongs to. */
export function previousMonthRange(dayKey: string): DayRange {
  const [y, m] = dayKey.split("-").map(Number);
  // m is 1-based in the key and Date.UTC months are 0-based, so m-2 is "a month back".
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return monthRange(prev.toISOString().slice(0, 10));
}

/** Totals over a set of daily docs: one period's funnel numbers. */
export interface MetricsSummary {
  views: number;
  /** Sum of clicks across every contact channel. */
  contacts: number;
  /** Walk-in customers the business recorded (see recordWalkIn). */
  walkIns: number;
  byChannel: Partial<Record<ContactChannel, number>>;
}

export function summarizeDailyMetrics(
  days: BusinessDailyMetrics[],
): MetricsSummary {
  const summary: MetricsSummary = {
    views: 0,
    contacts: 0,
    walkIns: 0,
    byChannel: {},
  };
  for (const day of days) {
    summary.views += day.views ?? 0;
    summary.walkIns += day.walkIns ?? 0;
    for (const [channel, count] of Object.entries(day.clicks ?? {})) {
      if (!count) continue;
      summary.byChannel[channel as ContactChannel] =
        (summary.byChannel[channel as ContactChannel] ?? 0) + count;
      summary.contacts += count;
    }
  }
  return summary;
}

/** Capitalize only the first character, leaving the rest untouched. */
export function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Spanish label of a month key ("2026-06" → "Junio de 2026"). The first letter is
 * capitalized at the source (not via CSS `capitalize`, which would also upper-case the
 * "De" in "junio de 2026").
 */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return capitalizeFirst(
    new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-CR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
}
