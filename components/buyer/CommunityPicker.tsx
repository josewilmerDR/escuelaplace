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
import { AcademicCapIcon, MapPinIcon, XMarkIcon } from "@/components/ui/icons";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { COMMUNITY_RADIUS_KM, getSchoolsCached } from "@/lib/firestore";
import { localityLabel } from "@/lib/location";
import type { SchoolDoc } from "@/types";

type SchoolsState = "loading" | "error" | "loaded";

export function CommunityPicker({
  description = "Elige tu escuela o activa tu ubicación para ver primero los comercios que la apoyan.",
  subject = "businesses",
}: {
  /** Lead copy — override it on surfaces that order something other than businesses
   * (e.g. the /schools directory orders schools by proximity). */
  description?: string;
  /** Switches the subject of the ordering copy (statusText): supporting businesses vs.
   * nearby schools. Set to "schools" on surfaces that order schools instead of businesses
   * (e.g. the /schools directory). */
  subject?: "businesses" | "schools";
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

  // Hide/reopen are persisted (pickerHidden in localStorage) so a buyer who dismisses the
  // picker is not nagged with it on every visit; the quiet reopen chip keeps it reachable.
  const hide = () => {
    update({ ...prefs, pickerHidden: true });
    setExpanded(false);
  };
  const reopen = () => {
    update({ ...prefs, pickerHidden: false });
    setExpanded(true);
  };

  const hasCommunity = ready && (prefs.schoolId || prefs.location);
  const hidden = ready && prefs.pickerHidden === true;

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

  // Computed once and consumed by both the collapsed chip and the expanded card status,
  // so the copy stays in sync across both. The locationWithoutSchools string is already
  // school-correct ("no encontramos escuelas…"), so only the other two branches vary by
  // subject.
  const statusText =
    subject === "schools"
      ? prefs.schoolName
        ? `Mostrando primero las escuelas más cercanas a ${prefs.schoolName}`
        : locationWithoutSchools
          ? `No encontramos escuelas a menos de ${COMMUNITY_RADIUS_KM} km de tu ubicación — elige una de la lista.`
          : "Mostrando primero las escuelas más cercanas a tu ubicación"
      : prefs.schoolName
        ? `Mostrando primero quienes apoyan a ${prefs.schoolName}`
        : locationWithoutSchools
          ? `No encontramos escuelas a menos de ${COMMUNITY_RADIUS_KM} km de tu ubicación — elige una de la lista.`
          : "Mostrando primero quienes apoyan cerca de tu ubicación";

  // Dismissed entirely: leave only a quiet chip so the buyer can bring it back.
  if (hidden) {
    return (
      <div className="mb-8">
        <button
          type="button"
          onClick={reopen}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-2 pl-3 pr-4 text-sm font-medium text-muted shadow-sm hover:border-brand-dark hover:text-brand-darker"
        >
          <AcademicCapIcon className="h-4 w-4 shrink-0 text-brand-dark" />
          Elige tu escuela
        </button>
      </div>
    );
  }

  // Collapsed once a usable community is set. locationWithoutSchools stays expanded
  // because the buyer still has to pick a school from the list for it to take effect.
  const collapsed = hasCommunity && !locationWithoutSchools && !expanded;

  if (collapsed) {
    const Icon = prefs.schoolName ? AcademicCapIcon : MapPinIcon;
    return (
      <div className="mb-8">
        <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-gradient-to-br from-brand-tint/50 to-surface py-2 pl-4 pr-1 text-sm text-muted shadow-sm">
          <Icon className="h-4 w-4 shrink-0 text-brand-dark" />
          <span className="truncate">{statusText}</span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded-full px-2 py-1 font-medium text-brand-darker hover:underline"
          >
            Cambiar
          </button>
          {/* Hide the summary too, for buyers who don't want the strip at all. */}
          <button
            type="button"
            onClick={hide}
            aria-label="Ocultar"
            className="shrink-0 rounded-full p-1.5 text-muted hover:bg-border/60 hover:text-foreground"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </span>
      </div>
    );
  }

  return (
    // Brand-blue card (sky-500 → sky-600) with white text: softer than the deep navy
    // (~60% of its intensity) but the same band the site header already uses, so the
    // prompt still stands out and stays legible. Dismissable via the ✕.
    <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-4 text-white shadow-md ring-1 ring-black/5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-inset ring-white/25">
          <AcademicCapIcon className="h-5 w-5" />
        </span>
        <p className="flex-1 text-sm leading-snug text-white">{description}</p>
        {/* Editing an existing community: let the buyer back out without changing it. */}
        {hasCommunity && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-white hover:bg-white/10"
          >
            Listo
          </button>
        )}
        {/* Dismiss the whole card; reopens from the quiet chip (pickerHidden persists). */}
        <button
          type="button"
          onClick={hide}
          aria-label="Ocultar"
          className="shrink-0 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
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
          placeholder="Elige tu escuela…"
          ariaLabel="Tu escuela"
          className="flex-1"
          // Opaque white field so the blue card doesn't bleed through. The input also has
          // to set its own colors: the card is `text-white`, which the base `.input`
          // (no color of its own) would otherwise inherit — turning both the typed school
          // name and the placeholder white-on-white. Dark text + a brand-blue placeholder
          // that ties back to the card.
          inputClassName="bg-white text-foreground placeholder:text-brand-dark"
          emptyMessage={
            schoolsState === "loading"
              ? "Cargando escuelas…"
              : schoolsState === "error"
                ? "No pudimos cargar las escuelas. Recarga la página."
                : "Sin resultados"
          }
        />

        {/* Icon-only "my location" affordance (Google-Maps-style pin). aria-label + title
            carry the meaning that the text label used to; the pin pulses while locating. */}
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          aria-busy={locating}
          aria-label="Usar mi ubicación"
          title="Usar mi ubicación"
          className="btn btn-on-brand aspect-square shrink-0 px-0"
        >
          <MapPinIcon className={`h-5 w-5 ${locating ? "animate-pulse" : ""}`} />
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {hasCommunity && (
        <p
          role="status"
          className={`mt-3 flex items-center gap-2 text-sm ${
            locationWithoutSchools ? "text-amber-100" : "text-white"
          }`}
        >
          <span>{statusText}</span>
          {/* Inflated tap target (negative margin keeps the visual layout untouched). */}
          <button
            type="button"
            onClick={clear}
            className="-my-2 px-2 py-2 font-medium text-white hover:underline"
          >
            Limpiar
          </button>
        </p>
      )}
    </div>
  );
}
