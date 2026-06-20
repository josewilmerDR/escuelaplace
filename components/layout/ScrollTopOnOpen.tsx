"use client";

/**
 * Resets the window to the TOP when a page opens — and again whenever `dep` changes (e.g. the
 * profile id, so navigating school→school re-runs it) — UNLESS the URL carries a hash, so
 * intentional #section deep-links still land where they point.
 *
 * Why it's needed: a tall profile (wide cover + overlapping avatar) should open on its header,
 * but browsers restore a prior scroll position on reload/back, and client islands can nudge the
 * scroll on mount. This guarantees the visitor sees the cover/name/avatar first. It runs after
 * paint, so a genuine deep-link (hash present) is left untouched.
 */
import { useEffect } from "react";

export function ScrollTopOnOpen({ dep }: { dep?: string }) {
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [dep]);
  return null;
}
