"use client";

/**
 * Step 1 of the home "how it works" stepper, made interactive. The buyer picks their school
 * (in a modal) or activates their location right here; once set, the step itself reflects
 * the active community and offers Cambiar/Limpiar. This replaces the standalone
 * <CommunityPicker> card on the home — the feed (<RankedFeed>) reads the same localStorage
 * prefs and re-ranks automatically. The buyer has no account, so state lives in localStorage
 * via useBuyerPreferences.
 */
import { useEffect, useMemo, useState } from "react";
import { distanceBetween } from "geofire-common";
import { Combobox } from "@/components/ui/Combobox";
import { Modal } from "@/components/ui/Modal";
import { StepTile } from "@/components/ui/StepTile";
import { AcademicCapIcon, MapPinIcon } from "@/components/ui/icons";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { COMMUNITY_RADIUS_KM, getSchoolsCached } from "@/lib/firestore";
import { localityLabel } from "@/lib/location";
import type { SchoolDoc } from "@/types";

type SchoolsState = "loading" | "error" | "loaded";

export function CommunityStep() {
  const { prefs, ready, update } = useBuyerPreferences();
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [schoolsState, setSchoolsState] = useState<SchoolsState>("loading");
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (id) setOpen(false);
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
        // Close on success; the locationWithoutSchools guard below still prompts the
        // buyer to pick a school inline if their area has none registered.
        setOpen(false);
      },
      () => {
        setError("No pudimos obtener tu ubicación.");
        setLocating(false);
      },
    );
  };

  const clear = () => {
    update({});
    setError(null);
  };

  const hasCommunity = ready && (prefs.schoolId || prefs.location);

  // Whether any known school falls inside the community radius of the buyer's location.
  // Derived from the already-fetched list (no extra geo query); null while there is no
  // location or the list hasn't loaded. Without it, "use my location" in an area with no
  // registered schools confirms success while the feed order never actually changes.
  const hasNearbySchool = useMemo(() => {
    if (!prefs.location || schoolsState !== "loaded") return null;
    const center: [number, number] = [prefs.location.lat, prefs.location.lng];
    return schools.some((s) => {
      const gp = s.location?.geopoint;
      return (
        gp != null &&
        distanceBetween([gp.latitude, gp.longitude], center) <= COMMUNITY_RADIUS_KM
      );
    });
  }, [prefs.location, schools, schoolsState]);

  const locationWithoutSchools =
    !prefs.schoolId && prefs.location && hasNearbySchool === false;

  // A usable community is set (school chosen, or a location with schools nearby): the step
  // becomes a quiet summary. locationWithoutSchools falls through to the triggers + an inline
  // prompt, because the buyer still has to pick a school for the ranking to change.
  const showSummary = hasCommunity && !locationWithoutSchools;

  return (
    <li className="flex items-start gap-3 text-left sm:flex-col sm:items-center sm:text-center">
      <StepTile step={1}>
        <AcademicCapIcon className="h-5 w-5" />
      </StepTile>
      <div className="min-w-0 sm:mt-3">
        {showSummary ? (
          <>
            <h3 className="flex items-center gap-1.5 font-semibold tracking-tight text-foreground sm:justify-center">
              <MapPinIcon className="h-4 w-4 shrink-0 text-brand-dark" aria-hidden />
              <span className="truncate">{prefs.schoolName ?? "Tu zona"}</span>
            </h3>
            <p className="mt-0.5 text-sm text-muted">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="font-medium text-brand-darker hover:underline"
              >
                Cambiar
              </button>
              {" · "}
              <button
                type="button"
                onClick={clear}
                className="font-medium text-brand-darker hover:underline"
              >
                Limpiar
              </button>
            </p>
          </>
        ) : (
          <h3 className="font-semibold tracking-tight text-foreground">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-brand-darker hover:underline"
            >
              Elegí tu escuela
            </button>{" "}
            o{" "}
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="text-brand-darker hover:underline disabled:opacity-60"
            >
              {locating ? "activando…" : "activá tu ubicación"}
            </button>
          </h3>
        )}

        {locationWithoutSchools && (
          <p className="mt-0.5 text-sm text-amber-700">
            No hay escuelas a menos de {COMMUNITY_RADIUS_KM} km. Elegí una de la lista.
          </p>
        )}
        {error && !open && (
          <p role="alert" className="mt-0.5 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      <Modal open={open} title="Elegí tu escuela" onClose={() => setOpen(false)}>
        {/* Deliberate: the list includes UNVERIFIED schools (getSchools filters by status
            only). Choosing a community is not a trust signal — verification gates the
            payment/donation flows elsewhere, and a buyer whose school just joined must
            still be able to pick it. */}
        <Combobox
          options={schools.map((s) => ({
            id: s.id,
            label: s.name,
            hint: localityLabel(s.location) || undefined,
          }))}
          value={ready ? (prefs.schoolId ?? "") : ""}
          onChange={onSchool}
          placeholder="Buscá tu escuela…"
          ariaLabel="Tu escuela"
          emptyMessage={
            schoolsState === "loading"
              ? "Cargando escuelas…"
              : schoolsState === "error"
                ? "No pudimos cargar las escuelas. Recargá la página."
                : "Sin resultados"
          }
        />

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />o
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          aria-busy={locating}
          className="btn btn-secondary w-full"
        >
          <MapPinIcon
            className={`h-5 w-5 ${locating ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {locating ? "Obteniendo ubicación…" : "Usar mi ubicación"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
      </Modal>
    </li>
  );
}
