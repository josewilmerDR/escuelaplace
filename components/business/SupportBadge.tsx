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
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { TIER_BADGE } from "@/components/business/BusinessCard";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import {
  rankBusinessFeed,
  resolveCommunitySchoolIds,
  type SupportedSchool,
  type SupportTier,
} from "@/lib/firestore";

export function SupportBadge({ businessId }: { businessId: string }) {
  const { prefs, ready } = useBuyerPreferences();
  const [tier, setTier] = useState<SupportTier | null>(null);
  // Schools the business genuinely supports (counting subscriptions only), most
  // buyer-relevant first — same source the card's "Apoya a" line uses.
  const [supportedSchools, setSupportedSchools] = useState<SupportedSchool[]>([]);

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
        if (!cancelled && ranked) {
          setTier(ranked.tier);
          setSupportedSchools(ranked.supportedSchools);
        }
      } catch {
        if (!cancelled) {
          setTier(null);
          setSupportedSchools([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, businessId, prefs.schoolId, prefs.location]);

  const badge = tier && tier !== "none" ? TIER_BADGE[tier] : null;

  return (
    // text-center/sm:text-left follows the header's center→left switch (the page wraps
    // this in a centered flex on mobile, left on desktop).
    <div className="mt-3 min-h-7 text-center sm:text-left">
      {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
      {supportedSchools.length > 0 && (
        // Name the supported school(s) here too, mirroring the card's "Apoya a {school}"
        // line — a buyer who tapped that on the card finds it confirmed on the profile,
        // not just the abstract tier. Distinct from the doc's *linked* school ("Vinculado
        // a" in the header meta), which the business may not actually support.
        <p className="mt-2 text-sm text-muted">
          Apoya a{" "}
          <Link
            href={`/school/${supportedSchools[0].id}`}
            className="font-medium text-brand-darker hover:underline"
          >
            {supportedSchools[0].name}
          </Link>
          {supportedSchools.length > 1 && (
            // Links down to the full "Escuelas que apoya" section on the same profile,
            // so the collapsed "+N" is no longer a dead end (the other schools were
            // otherwise unreachable from here).
            <>
              {" y "}
              <a
                href="#escuelas"
                className="font-medium text-brand-darker hover:underline"
              >
                {supportedSchools.length - 1} más
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
