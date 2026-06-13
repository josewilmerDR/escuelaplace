"use client";

/**
 * School selector for the donation flow (/panel/donate). Replaces the old alphabetical
 * `<select>` with a relevance-ordered carousel so the donor meets schools that matter to them
 * — proximity first — instead of "Escuela Aurora" just because it sorts first.
 *
 * Layout: a horizontally scrollable carousel of the top relevant schools (selectable cards) +
 * a trailing "Más escuelas" tile that opens the full /schools directory, with a searchable
 * Combobox below as the fallback for any school not in the carousel.
 *
 * Relevance reuses rankSchoolsByRelevance with the buyer's community (location, or the pin of a
 * school they chose) read from the same localStorage store the home/search CommunityPicker
 * writes. A discreet "usar mi ubicación" button lets a signed-in donor enable proximity here
 * even if they never used that picker.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Combobox } from "@/components/ui/Combobox";
import { SchoolCard } from "@/components/school/SchoolCard";
import { MapPinIcon } from "@/components/ui/icons";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { rankSchoolsByRelevance, toSchoolCardData } from "@/lib/firestore";
import type { SchoolDoc } from "@/types";

/** Schools shown in the carousel before the "Más escuelas" tile. */
const CAROUSEL_SIZE = 3;
/** Each slide; widths give ~1 visible on mobile, ~2 on small, ~3 on desktop. */
const SLIDE = "snap-start shrink-0 w-[80%] sm:w-[46%] lg:w-[31%]";

export function SchoolPicker({
  schools,
  value,
  onChange,
}: {
  schools: SchoolDoc[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { prefs, ready, update } = useBuyerPreferences();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const cards = useMemo(() => schools.map(toSchoolCardData), [schools]);

  // Effective center: explicit location, or the pin of the school the buyer chose (so picking
  // a school re-orders by proximity to it even without GPS).
  const location = useMemo(() => {
    if (prefs.location) return prefs.location;
    if (prefs.schoolId) {
      const chosen = cards.find((s) => s.id === prefs.schoolId);
      if (chosen?.lat != null && chosen?.lng != null) {
        return { lat: chosen.lat, lng: chosen.lng };
      }
    }
    return undefined;
  }, [prefs.location, prefs.schoolId, cards]);

  const hasLocation = ready && location != null;

  // Top relevant schools, always including the current selection so a deep-linked
  // (?schoolId=) or just-searched school stays visible in the carousel.
  const top = useMemo(() => {
    const ranked = rankSchoolsByRelevance(
      cards,
      hasLocation ? { location } : {},
    ).map((r) => r.school);
    const list = ranked.slice(0, CAROUSEL_SIZE);
    if (value && !list.some((s) => s.id === value)) {
      const selected = cards.find((s) => s.id === value);
      if (selected) return [selected, ...list].slice(0, CAROUSEL_SIZE);
    }
    return list;
  }, [cards, hasLocation, location, value]);

  const useMyLocation = () => {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {hasLocation
            ? "Escuelas cercanas a tu comunidad"
            : "Escuelas con más actividad"}
        </p>
        {!hasLocation && (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            aria-busy={locating}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-darker hover:underline disabled:opacity-60"
          >
            <MapPinIcon className="h-4 w-4" />
            {locating ? "Ubicando…" : "Ver escuelas cercanas"}
          </button>
        )}
      </div>

      {geoError && (
        <p role="alert" className="text-sm text-red-600">
          {geoError}
        </p>
      )}

      {top.length > 0 && (
        <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
          {/* `contents` keeps the radiogroup owning only the radio cards (not the trailing
              link) while letting the slides stay flex items of the scroll track. */}
          <div role="radiogroup" aria-label="Escuelas sugeridas" className="contents">
            {top.map((school) => (
              <div key={school.id} className={SLIDE}>
                <SchoolCard
                  school={school}
                  selected={school.id === value}
                  onSelect={onChange}
                />
              </div>
            ))}
          </div>

          {/* 4th element: browse/search the full directory. */}
          <Link
            href="/schools"
            className={`${SLIDE} flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border p-4 text-center text-sm font-medium text-brand-darker transition hover:border-brand-dark hover:bg-brand-tint/40`}
          >
            <span aria-hidden className="text-2xl leading-none">
              →
            </span>
            Más escuelas
            <span className="text-xs font-normal text-muted">
              Ver todas y buscar por cercanía
            </span>
          </Link>
        </div>
      )}

      {/* Fallback search for any school not in the carousel. */}
      <Combobox
        options={cards.map((s) => ({
          id: s.id,
          label: s.name,
          hint: s.locality || undefined,
        }))}
        value={value}
        onChange={onChange}
        placeholder="o buscá tu escuela…"
        ariaLabel="Buscar escuela"
        emptyMessage="Sin resultados"
      />
    </div>
  );
}
