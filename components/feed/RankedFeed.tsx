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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
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
  interleave,
  interleaveAfter = 3,
}: {
  initial: BusinessCardData[];
  /** Relevance R per business id (search mode). Omit for explore mode. */
  relevanceById?: Record<string, number>;
  /** Optional node rendered between the first `interleaveAfter` cards and the rest — the home's
   * schools block, so the feed reads "top businesses → schools → the rest". The split is here
   * (not server-side) because it must follow the CLIENT-re-ranked order the buyer actually sees.
   * Omit to render a single uninterrupted grid. */
  interleave?: ReactNode;
  interleaveAfter?: number;
}) {
  const { prefs, ready } = useBuyerPreferences();
  // The personalized order, tagged with the community that produced it. The tag is what
  // prevents stale UI: clearing the community (the effect below stops running, so the
  // state is never overwritten) or switching school A → B (the old result lingers while
  // B resolves) must never show tiers/badges computed for a community that is no longer
  // the current one — the render gate compares tags instead of trusting the state.
  const [ranked, setRanked] = useState<{
    communityKey: string;
    result: RankedBusiness<BusinessCardData>[];
  } | null>(null);

  // Visible degradation flag: a silently failed re-rank is indistinguishable from
  // "personalization worked and nobody supports your community".
  const [rankFailed, setRankFailed] = useState(false);

  const hasCommunity = Boolean(prefs.schoolId || prefs.location);
  const communityKey = `${prefs.schoolId ?? ""}|${
    prefs.location ? `${prefs.location.lat},${prefs.location.lng}` : ""
  }`;

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
        if (cancelled) return;
        setRankFailed(false);
        // Animate the reorder when the browser supports view transitions (each card
        // carries a per-business view-transition-name) — a silent jump loses the
        // user's place in the grid. flushSync so the DOM mutates inside the snapshot.
        const apply = () => setRanked({ communityKey, result });
        if (document.startViewTransition) {
          document.startViewTransition(() => flushSync(apply));
        } else {
          apply();
        }
      } catch {
        // Re-rank is best-effort; the baseline order stays, but say so (see rankFailed).
        if (!cancelled) setRankFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    hasCommunity,
    initial,
    relevanceById,
    prefs.schoolId,
    prefs.location,
    communityKey,
  ]);

  // Baseline (server order) unless we have a personalized order for the CURRENT community.
  const personalized = hasCommunity && ranked?.communityKey === communityKey;
  const cards = useMemo(
    () =>
      personalized && ranked
        ? ranked.result
        : initial.map((business) => ({
            business,
            tier: null as null,
            // Baseline (no community yet): supported schools are unknown, so the
            // "Apoya a …" line stays hidden until the re-rank resolves them.
            supportedSchools: [],
          })),
    [personalized, ranked, initial],
  );

  if (initial.length === 0) return null;

  const grid = (items: typeof cards) => (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ business, tier, supportedSchools }) => (
        <BusinessCard
          key={business.id}
          business={business}
          tier={tier}
          supportedSchools={supportedSchools}
        />
      ))}
    </div>
  );

  // Split the grid around the interleaved node. With fewer than `interleaveAfter` cards the head
  // holds them all and the tail is empty (businesses → schools, no "rest").
  const showInterleave = interleave != null;
  const head = showInterleave ? cards.slice(0, interleaveAfter) : cards;
  const tail = showInterleave ? cards.slice(interleaveAfter) : [];

  return (
    <div>
      {/* Announce the reorder to screen readers; sighted users see the badges appear. */}
      <p aria-live="polite" className="sr-only">
        {personalized ? "Resultados ordenados según tu comunidad." : ""}
      </p>

      {rankFailed && hasCommunity && (
        <p role="status" className="mb-4 text-sm text-muted">
          No pudimos personalizar el orden según tu comunidad — mostramos el orden
          general.
        </p>
      )}

      {grid(head)}
      {showInterleave && interleave}
      {tail.length > 0 && grid(tail)}
    </div>
  );
}
