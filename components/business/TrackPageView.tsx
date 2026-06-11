"use client";

import { useEffect } from "react";
import { trackBusinessEvent } from "@/lib/track";

/**
 * Counts one profile view per browser session (sessionStorage dedupe). Client-side on
 * purpose: counting in the SSR render would tally bots and Next prefetches, and views
 * are only the funnel's denominator — contact clicks are the metric that matters.
 * Renders nothing.
 */
export function TrackPageView({ businessId }: { businessId: string }) {
  useEffect(() => {
    const key = `ep:viewed:${businessId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage unavailable (strict private mode): count the view anyway.
    }
    trackBusinessEvent(businessId, "view");
  }, [businessId]);

  return null;
}
