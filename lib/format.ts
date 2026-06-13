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
