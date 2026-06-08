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
