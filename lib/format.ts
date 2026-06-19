/** Display formatting helpers (UI copy is Spanish; Costa Rica locale). */

const crc = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  maximumFractionDigits: 0,
});

/** Format an amount in colones, e.g. 5000 -> "₡5 000". */
export function formatColones(amount: number): string {
  return crc.format(amount);
}

/**
 * Format an amount in an arbitrary ISO 4217 currency (project goals are country-agnostic,
 * so they are NOT assumed to be colones). Falls back to the code if the runtime can't
 * format it. Costa Rica locale for grouping, consistent with formatColones.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-CR")}`;
  }
}

/**
 * Format a 0–5 rating to one decimal, Costa Rica locale (e.g. 4.5 -> "4,5"). One place
 * for the rule so the profile header, the review list and the Stars label can't drift.
 */
export function formatRating(value: number): string {
  return value.toLocaleString("es-CR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// UTC so a calendar DAY renders as the same day for every viewer (tool dates are stored at
// UTC midnight — see toolDateFromInput). Without timeZone:'UTC' a server/reader east of UTC
// would format the instant into the previous day.
const dateFmt = new Intl.DateTimeFormat("es-CR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Format a date (ms since epoch) as "15 jun 2026", Costa Rica locale, in UTC. Used for the
 * optional activity window of a school tool (rifa/venta/etc.), whose dates are day-granular.
 */
export function formatDate(ms: number): string {
  return dateFmt.format(new Date(ms));
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Approximate human duration for the school's "typically confirms in ~X" chip:
 * "menos de 1 hora", "5 horas", "3 días". Coarse on purpose — it qualifies an
 * average, not a promise.
 */
export function formatApproxDuration(ms: number): string {
  if (ms < HOUR_MS) return "menos de 1 hora";
  const hours = Math.round(ms / HOUR_MS);
  if (hours < 24) return hours === 1 ? "1 hora" : `${hours} horas`;
  const days = Math.max(1, Math.round(ms / DAY_MS));
  return days === 1 ? "1 día" : `${days} días`;
}

/**
 * Coarse "how long ago" label for a past instant — how long a support has waited for
 * confirmation: "hoy", "ayer", "hace 5 días". Day-granular and floored on purpose: the
 * pending nudge cares about staleness, not precision. Negative inputs (clock skew) read
 * as "hoy".
 */
export function formatDaysAgo(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

/**
 * Business count label for a category: "1 comercio" vs "N comercios". Treats a missing
 * count (legacy docs without the denormalized field) as 0, which reads "0 comercios".
 */
export function pluralizeBusinesses(count: number | undefined): string {
  const n = count ?? 0;
  return n === 1 ? "1 comercio" : `${n} comercios`;
}
