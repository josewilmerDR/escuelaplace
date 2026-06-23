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
}: {
  initial: BusinessCardData[];
  /** Relevance R per business id (search mode). Omit for explore mode. */
  relevanceById?: Record<string, number>;
  /** Optional node rendered after the first VISUAL ROW of businesses — the home's schools block,
   * so the feed reads "top businesses → schools → the rest". The position is responsive (after
   * 1 / 2 / 3 cards at the mobile / sm / lg breakpoints, matching the grid's columns) and lives
   * here (not server-side) because it must follow the CLIENT-re-ranked order the buyer actually
   * sees. Omit to render a single uninterrupted grid. */
  interleave?: ReactNode;
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

  const showInterleave = interleave != null;

  // Status lines shown above the feed in both layouts.
  const status = (
    <>
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
    </>
  );

  // Search / category mode: one uninterrupted grid.
  if (!showInterleave) {
    return (
      <div>
        {status}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ business, tier, supportedSchools }) => (
            <BusinessCard
              key={business.id}
              business={business}
              tier={tier}
              supportedSchools={supportedSchools}
            />
          ))}
        </div>
      </div>
    );
  }

  // Home mode: interleave the schools block AFTER THE FIRST VISUAL ROW of businesses — 1 / 2 / 3
  // cards at the mobile / sm / lg breakpoints. A fixed array index can't express that (3 is one
  // row on desktop but three stacked rows on mobile), so rather than split the array we keep ALL
  // cards in ONE grid and position the block with CSS `order`:
  //   - cards take even orders 0, 2, 4, … (their source / re-ranked order is preserved);
  //   - the block is `col-span-full` with an odd order that lands right after the first row —
  //     1 (after card 0) on mobile, 3 (after card 1) at sm, 5 (after card 2) at lg.
  // Desktop is unchanged; only mobile/tablet pull the block up. A col-span-full item can't share
  // a row, so it always breaks onto its own full-width band wherever its order places it.
  return (
    <div>
      {status}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ business, tier, supportedSchools }, i) => (
          // `order` is a runtime value, so it goes inline (Tailwind can't JIT `order-[N]`); it
          // places each card around the interleaved block below.
          <BusinessCard
            key={business.id}
            business={business}
            tier={tier}
            supportedSchools={supportedSchools}
            style={{ order: i * 2 }}
          />
        ))}
        {/* min-w-0 lets this grid item shrink to the column width so the carousel's own
            overflow-x scroll contains the horizontal scroll — without it the track's intrinsic
            width forces the whole page wider on mobile. */}
        <div className="order-1 col-span-full min-w-0 sm:order-3 lg:order-5">
          {interleave}
        </div>
      </div>
    </div>
  );
}
