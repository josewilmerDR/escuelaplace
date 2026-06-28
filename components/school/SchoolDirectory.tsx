"use client";

/**
 * The interactive /schools directory: a filter toolbar + the school grid.
 *
 * Unlike the home/business surfaces, this page is NOT about setting the buyer's "community"
 * (that's <CommunityPicker>, which writes schoolId to localStorage so OTHER surfaces can
 * boost local supporters). Here the two controls act ONLY on the directory in front of the
 * user:
 *
 * - Filter (text): narrows the grid in place by name/locality — for "find this specific
 *   school". Pure client-side substring match (accent-insensitive), no navigation, no
 *   localStorage. The list is small (capped at DIRECTORY_LIMIT) so in-memory filtering is fine.
 * - "Cerca de mí" (location): orders the grid by proximity. This still goes through the buyer's
 *   shared location (useBuyerPreferences) — a real buyer location is legitimately reused across
 *   the site — but choosing a school here no longer hijacks that community state.
 *
 * The server renders `initial` already in the baseline order (activity, community-agnostic) for
 * SEO/first paint; proximity ordering and filtering layer on top after mount. Proximity is pure
 * math over data already on each card (no Firestore reads), so it's a synchronous useMemo.
 */
import { useMemo, useState } from "react";
import { SchoolCard } from "@/components/school/SchoolCard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  MapPinIcon,
  SearchIcon,
  AcademicCapIcon,
  XMarkIcon,
} from "@/components/ui/icons";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { rankSchoolsByRelevance } from "@/lib/firestore";
import { normalize } from "@/lib/search";
import type { SchoolCardData } from "@/types";

export function SchoolDirectory({
  initial,
  limit,
}: {
  initial: SchoolCardData[];
  /** The server-side render cap; when the directory is full we say so (but only with no
   * active filter, since the cap describes the whole directory, not the filtered view). */
  limit: number;
}) {
  const { prefs, ready, update } = useBuyerPreferences();
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const sortByProximity = ready && !!prefs.location;

  // Accent/case-insensitive substring filter over name + locality, so "jose" matches both
  // "Juan Rafael Mora Porras" (by locality "San José") and any "San José" school by name.
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return initial;
    return initial.filter(
      (s) => normalize(s.name).includes(q) || normalize(s.locality).includes(q),
    );
  }, [query, initial]);

  // Filter first, then order: proximity is a presentation order on whatever the filter left.
  const cards = useMemo(() => {
    if (!sortByProximity || !prefs.location) return filtered;
    return rankSchoolsByRelevance(filtered, { location: prefs.location }).map(
      (r) => r.school,
    );
  }, [filtered, sortByProximity, prefs.location]);

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Tu navegador no permite compartir ubicación.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({
          ...prefs,
          location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        setLocating(false);
      },
      () => {
        setGeoError("No pudimos obtener tu ubicación.");
        setLocating(false);
      },
    );
  };

  // Turn proximity ordering off without touching the rest of the buyer's prefs (e.g. a school
  // they may have chosen elsewhere on the site).
  const clearLocation = () => update({ ...prefs, location: undefined });

  const hasFilter = query.trim().length > 0;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Filter field — a plain search box, not a select: free text narrows the grid live.
            We compose the .input styles inline instead of using the class: .input is unlayered
            CSS so its px-3 would beat Tailwind's layered pl-10/pr-10, pushing the placeholder
            under the leading icon (and typed text under the clear button). Keeping the same
            border/radius/focus-ring as .input, only swapping the horizontal padding. */}
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca una escuela por nombre o localidad…"
            aria-label="Filtrar escuelas"
            className="w-full rounded-xl border border-border py-2 pl-10 pr-10 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
          />
          {hasFilter && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar filtro"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-border/60 hover:text-foreground"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Proximity toggle. Active = ordering by distance; click again to turn it off. */}
        <button
          type="button"
          onClick={sortByProximity ? clearLocation : requestLocation}
          disabled={locating}
          aria-busy={locating}
          aria-pressed={sortByProximity}
          className={`btn shrink-0 gap-2 ${
            sortByProximity ? "btn-primary" : "btn-outline"
          }`}
        >
          <MapPinIcon className={`h-5 w-5 ${locating ? "animate-pulse" : ""}`} />
          {sortByProximity ? "Cerca de mí" : "Ordenar por cercanía"}
          {sortByProximity && <XMarkIcon className="h-4 w-4" />}
        </button>
      </div>

      {geoError && (
        <p role="alert" className="mb-4 text-sm text-error">
          {geoError}
        </p>
      )}

      {/* Live count + ordering note for assistive tech and as a quiet on-screen status. */}
      <p aria-live="polite" className="sr-only">
        {cards.length}{" "}
        {cards.length === 1 ? "escuela" : "escuelas"}
        {sortByProximity ? ", ordenadas por cercanía a tu ubicación." : "."}
      </p>

      {cards.length === 0 ? (
        // The page only mounts this when there ARE schools, so an empty grid here means the
        // filter excluded them all — distinct from the "no schools published" page state.
        <EmptyState
          icon={<AcademicCapIcon className="h-7 w-7" />}
          title="Ninguna escuela coincide con tu búsqueda"
          description={`No encontramos escuelas para «${query.trim()}». Prueba con otro nombre o localidad.`}
          cta={
            <button
              type="button"
              onClick={() => setQuery("")}
              className="btn btn-primary"
            >
              Limpiar filtro
            </button>
          }
        />
      ) : (
        <>
          {/* Semantic list: assistive tech should hear "list, N items"; role="list" survives
              the list-style reset Tailwind applies to <ul>. */}
          <ul role="list" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((school) => (
              <li key={school.id}>
                <SchoolCard school={school} />
              </li>
            ))}
          </ul>
          {!hasFilter && initial.length === limit && (
            <p className="mt-8 text-center text-sm text-muted">
              Mostrando las primeras {limit} escuelas del directorio.
            </p>
          )}
        </>
      )}
    </div>
  );
}
