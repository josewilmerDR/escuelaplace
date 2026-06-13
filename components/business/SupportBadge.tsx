"use client";

/**
 * Support-tier badge for the public business profile. Client island: the tier is
 * relative to the BUYER's community (localStorage), so it cannot be SSR'd. It resolves
 * through the same pipeline as the feed (rankBusinessFeed over a single business), so
 * the profile and the cards can never tell a different support story.
 *
 * With no community set, communitySchoolIds is [] and the tier degrades to
 * general/none — still truthful. The slot has a fixed min-height so the badge popping
 * in doesn't shift the description below; on failure it stays empty (no badge beats a
 * wrong badge).
 *
 * The "none" tier renders nothing here: a "doesn't support any school yet" label on
 * the merchant's own profile — the page they share on WhatsApp — reads as a public
 * warning. The nudge to subscribe lives in ManageBar, where only the owner sees it.
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { TIER_BADGE } from "@/components/business/BusinessCard";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import {
  rankBusinessFeed,
  resolveCommunitySchoolIds,
  type SupportTier,
} from "@/lib/firestore";

export function SupportBadge({ businessId }: { businessId: string }) {
  const { prefs, ready } = useBuyerPreferences();
  const [tier, setTier] = useState<SupportTier | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      try {
        const communitySchoolIds = await resolveCommunitySchoolIds({
          schoolId: prefs.schoolId,
          location: prefs.location,
        });
        const [ranked] = await rankBusinessFeed([{ id: businessId }], {
          communitySchoolIds,
        });
        if (!cancelled && ranked) setTier(ranked.tier);
      } catch {
        if (!cancelled) setTier(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, businessId, prefs.schoolId, prefs.location]);

  const badge = tier && tier !== "none" ? TIER_BADGE[tier] : null;

  return (
    <div className="mt-3 flex min-h-7 items-center">
      {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
    </div>
  );
}
