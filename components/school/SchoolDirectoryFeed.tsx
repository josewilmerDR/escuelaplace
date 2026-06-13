"use client";

/**
 * Proximity-aware school directory feed for /schools. The server renders `initial` already in
 * the baseline order (activity, community-agnostic) for SEO/first paint; after mount we read
 * the buyer's community from localStorage (same store the <CommunityPicker> writes) and
 * re-order by proximity. With no community known, the order stays at the SSR baseline.
 *
 * Unlike the business <RankedFeed>, the school re-rank needs NO Firestore reads — proximity is
 * pure math over data already on each card — so it is a synchronous useMemo, with no async
 * state or failure mode to handle.
 */
import { useMemo } from "react";
import { SchoolCard } from "@/components/school/SchoolCard";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { rankSchoolsByRelevance } from "@/lib/firestore";
import type { SchoolCardData } from "@/types";

export function SchoolDirectoryFeed({ initial }: { initial: SchoolCardData[] }) {
  const { prefs, ready } = useBuyerPreferences();

  // Effective center: the buyer's explicit location, or the pin of the school they chose (so
  // picking a school re-orders by proximity to it even without GPS). Both come from the
  // CommunityPicker via localStorage.
  const location = useMemo(() => {
    if (prefs.location) return prefs.location;
    if (prefs.schoolId) {
      const chosen = initial.find((s) => s.id === prefs.schoolId);
      if (chosen?.lat != null && chosen?.lng != null) {
        return { lat: chosen.lat, lng: chosen.lng };
      }
    }
    return undefined;
  }, [prefs.location, prefs.schoolId, initial]);

  const cards = useMemo(() => {
    if (!ready || !location) return initial; // SSR baseline (activity order)
    return rankSchoolsByRelevance(initial, { location }).map((r) => r.school);
  }, [ready, location, initial]);

  if (initial.length === 0) return null;

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {ready && location ? "Escuelas ordenadas por cercanía a tu comunidad." : ""}
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((school) => (
          <SchoolCard key={school.id} school={school} />
        ))}
      </div>
    </div>
  );
}
