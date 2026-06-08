"use client";

/**
 * Mission-aware feed with progressive personalization, for both modes:
 * - Explore (no `relevanceById`): R = 1 for all; order is community → general → none.
 * - Search (`relevanceById` provided): relevance gates the set, then mission orders it.
 *
 * The server renders `initial` already in the baseline order (stored `ranking.score`,
 * community-agnostic) for SEO/first paint. After mount we read the buyer's community from
 * localStorage and re-rank client-side, surfacing local supporters and showing per-tier
 * badges. With no community known, the order stays at the SSR baseline.
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

export function RankedFeed({
  initial,
  relevanceById,
}: {
  initial: BusinessCardData[];
  /** Relevance R per business id (search mode). Omit for explore mode. */
  relevanceById?: Record<string, number>;
}) {
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
        const result = await rankBusinessFeed(initial, {
          communitySchoolIds,
          relevanceById,
        });
        if (!cancelled) setRanked(result);
      } catch {
        // Re-rank is best-effort; on failure we keep the baseline order.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, hasCommunity, initial, relevanceById, prefs.schoolId, prefs.location]);

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
