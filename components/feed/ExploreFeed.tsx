"use client";

/**
 * Explore feed with progressive personalization.
 *
 * The server renders `initial` already ordered by the stored baseline `ranking.score`
 * (mission-general, good for SEO and first paint). After mount we read the buyer's
 * community from localStorage, resolve it (chosen school + nearby schools), and re-rank
 * client-side so businesses supporting THE BUYER'S community rise, with per-tier badges.
 * If no community is known, the order stays at the baseline (and we invite the buyer to
 * set their location).
 */
import { useEffect, useMemo, useState } from "react";
import { BusinessCard } from "@/components/business/BusinessCard";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import {
  type RankedBusiness,
  rankBusinessFeed,
  resolveCommunitySchoolIds,
} from "@/lib/firestore";
import type { BusinessCardData } from "@/types";

export function ExploreFeed({ initial }: { initial: BusinessCardData[] }) {
  const { prefs, ready } = useBuyerPreferences();
  const [ranked, setRanked] = useState<RankedBusiness<BusinessCardData>[] | null>(
    null,
  );

  const hasCommunity = Boolean(prefs.schoolId || prefs.location);

  useEffect(() => {
    if (!ready || !hasCommunity || initial.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const communitySchoolIds = await resolveCommunitySchoolIds({
          schoolId: prefs.schoolId,
          location: prefs.location,
        });
        const result = await rankBusinessFeed(initial, { communitySchoolIds });
        if (!cancelled) setRanked(result);
      } catch {
        // Re-rank is best-effort; on failure we keep the baseline order.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, hasCommunity, initial, prefs.schoolId, prefs.location]);

  // Baseline (server order) until the personalized re-rank resolves.
  const cards = useMemo(
    () =>
      ranked ?? initial.map((business) => ({ business, tier: null as null })),
    [ranked, initial],
  );

  if (initial.length === 0) return null;

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ business, tier }) => (
        <BusinessCard key={business.id} business={business} tier={tier} />
      ))}
    </div>
  );
}
