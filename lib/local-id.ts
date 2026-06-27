/**
 * Ephemeral local ids for draft rows in the editors (project stages, guided-tour stages, sale
 * products, service items). They key React lists and match a row to its async media upload, then
 * are STRIPPED before the doc is written (stored arrays are positional). Minted in event handlers
 * or lazy initial state — never during render — so the non-deterministic fallback is SSR-safe.
 * Prefers crypto.randomUUID(); the `prefix` only shapes the legacy fallback id.
 */
export function newLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
