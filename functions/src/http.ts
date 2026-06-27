/**
 * Shared input-handling helpers for the HTTP-triggered functions (the accountless endpoints
 * `trackInteraction` and `castPageantApplause`). Both take untrusted bodies and path-component
 * ids straight off the wire, so the parse and the id-shape check live here once instead of being
 * re-implemented per endpoint — one hardened surface to maintain.
 */

/** Firestore auto-ids and seeded ids both match this; anything else in a path component (or in
 * untrusted HTTP input that becomes one) is garbage we reject before touching the DB. */
export const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Parse a possibly-beacon HTTP body. `navigator.sendBeacon` posts `text/plain` (a "simple"
 * request, no CORS preflight), so the body arrives as a raw string; a JSON `fetch` arrives
 * already parsed. Returns the parsed payload, or `{ ok: false }` when a string body isn't valid
 * JSON — the caller answers that with a 400.
 */
export function parseBeaconBody(
  req: { body: unknown },
): { ok: true; payload: unknown } | { ok: false } {
  let payload: unknown = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return { ok: false };
    }
  }
  return { ok: true, payload };
}
