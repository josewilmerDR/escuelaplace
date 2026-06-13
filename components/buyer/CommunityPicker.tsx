"use client";

/**
 * Lets the buyer choose their community — a school and/or their location — which is what
 * the explore feed uses to boost local supporters. State lives in localStorage (the buyer
 * has no account), so this writes through useBuyerPreferences; <RankedFeed> subscribes to
 * the same store and re-ranks automatically when this changes.
 */
import { useEffect, useMemo, useState } from "react";
import { distanceBetween } from "geofire-common";
import { Combobox } from "@/components/ui/Combobox";
import { AcademicCapIcon, MapPinIcon } from "@/components/ui/icons";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { COMMUNITY_RADIUS_KM, getSchoolsCached } from "@/lib/firestore";
import { localityLabel } from "@/lib/location";
import type { SchoolDoc } from "@/types";

type SchoolsState = "loading" | "error" | "loaded";

export function CommunityPicker({
  description = "Elegí tu escuela o activá tu ubicación para ver primero los comercios que la apoyan.",
}: {
  /** Lead copy — override it on surfaces that order something other than businesses
   * (e.g. the /schools directory orders schools by proximity). */
  description?: string;
} = {}) {
  const { prefs, ready, update } = useBuyerPreferences();
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [schoolsState, setSchoolsState] = useState<SchoolsState>("loading");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once a community is set the picker collapses to a quiet one-line summary; "Cambiar"
  // expands the full card back. Returning buyers rarely switch schools, so the picker
  // should not keep occupying a full card on every visit.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSchoolsCached()
      .then((s) => {
        if (cancelled) return;
        setSchools(s);
        setSchoolsState("loaded");
      })
      .catch(() => {
        if (!cancelled) setSchoolsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSchool = (id: string) => {
    const school = schools.find((s) => s.id === id);
    update({ ...prefs, schoolId: id || undefined, schoolName: school?.name });
    setExpanded(false);
  };

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tu navegador no permite compartir ubicación.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({
          ...prefs,
          location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        setLocating(false);
        // Collapse on success; if the area has no registered schools the
        // locationWithoutSchools guard below keeps the full card open anyway.
        setExpanded(false);
      },
      () => {
        setError("No pudimos obtener tu ubicación.");
        setLocating(false);
      },
    );
  };

  const clear = () => {
    update({});
    setExpanded(false);
  };

  const hasCommunity = ready && (prefs.schoolId || prefs.location);

  // Whether any known school falls inside the community radius of the buyer's location.
  // Derived from the already-fetched list (no extra geo query) so it survives remounts;
  // null while there is no location or the list hasn't loaded. Without this check, "use
  // my location" in an area with no registered schools confirms success while the feed
  // order doesn't actually change (the ranking resolves an empty community).
  const hasNearbySchool = useMemo(() => {
    if (!prefs.location || schoolsState !== "loaded") return null;
    const center: [number, number] = [prefs.location.lat, prefs.location.lng];
    return schools.some((s) => {
      const gp = s.location?.geopoint;
      return (
        gp != null &&
        distanceBetween([gp.latitude, gp.longitude], center) <=
          COMMUNITY_RADIUS_KM
      );
    });
  }, [prefs.location, schools, schoolsState]);

  const locationWithoutSchools =
    !prefs.schoolId && prefs.location && hasNearbySchool === false;

  const statusText = prefs.schoolName
    ? `Mostrando primero quienes apoyan a ${prefs.schoolName}`
    : locationWithoutSchools
      ? `No encontramos escuelas a menos de ${COMMUNITY_RADIUS_KM} km de tu ubicación — elegí una de la lista.`
      : "Mostrando primero quienes apoyan cerca de tu ubicación";

  // Collapsed once a usable community is set. locationWithoutSchools stays expanded
  // because the buyer still has to pick a school from the list for it to take effect.
  const collapsed = hasCommunity && !locationWithoutSchools && !expanded;

  if (collapsed) {
    const Icon = prefs.schoolName ? AcademicCapIcon : MapPinIcon;
    return (
      <div className="mb-8">
        <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface py-2 pl-4 pr-2 text-sm text-muted">
          <Icon className="h-4 w-4 shrink-0 text-brand-dark" />
          <span className="truncate">{statusText}</span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded-full px-2 py-1 font-medium text-brand-darker hover:underline"
          >
            Cambiar
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{description}</p>
        {/* Editing an existing community: let the buyer back out without changing it. */}
        {hasCommunity && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="shrink-0 text-sm font-medium text-brand-darker hover:underline"
          >
            Listo
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Deliberate: the list includes UNVERIFIED schools (getSchools filters by
            status only). Choosing a community is not a trust signal — verification
            gates the payment/donation flows elsewhere, and a buyer whose school just
            joined must still be able to pick it. */}
        <Combobox
          options={schools.map((s) => ({
            id: s.id,
            label: s.name,
            // Disambiguates homonyms (school names repeat across localities) and lets
            // the buyer filter by place ("liberia", "escazu").
            hint: localityLabel(s.location) || undefined,
          }))}
          value={ready ? (prefs.schoolId ?? "") : ""}
          onChange={onSchool}
          placeholder="Elegí tu escuela…"
          ariaLabel="Tu escuela"
          className="flex-1"
          emptyMessage={
            schoolsState === "loading"
              ? "Cargando escuelas…"
              : schoolsState === "error"
                ? "No pudimos cargar las escuelas. Recargá la página."
                : "Sin resultados"
          }
        />

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          aria-busy={locating}
          className="btn btn-outline shrink-0"
        >
          {locating ? "Ubicando…" : "Usar mi ubicación"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {hasCommunity && (
        <p
          role="status"
          className={`mt-3 flex items-center gap-2 text-sm ${
            locationWithoutSchools ? "text-amber-700" : "text-muted"
          }`}
        >
          <span>{statusText}</span>
          {/* Inflated tap target (negative margin keeps the visual layout untouched). */}
          <button
            type="button"
            onClick={clear}
            className="-my-2 px-2 py-2 font-medium text-brand-darker hover:underline"
          >
            Limpiar
          </button>
        </p>
      )}
    </div>
  );
}
