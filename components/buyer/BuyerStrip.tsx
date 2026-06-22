"use client";

/**
 * The home "how it works" value strip, made stateful around the buyer's community.
 *
 * First visit (no community set): the full 1→2→3 stepper teaches the flow — step 1 is
 * interactive (pick a school in a modal or activate location → drives the feed ranking),
 * steps 2–3 are static copy. Once the buyer has a community the teaching is done: showing
 * the trailing steps again is less useful than the first time, so the strip collapses to a
 * single line naming the chosen school (or zone) with Cambiar/Limpiar, and steps 2–3 drop.
 *
 * Replaces the old <CommunityStep> + two static <BuyerStep>s that the home rendered apart.
 * The buyer has no account, so the community lives in localStorage via useBuyerPreferences;
 * <RankedFeed> reads the same store and re-ranks automatically when it changes.
 *
 * `ready` is false on the server and first client paint, so the SSR HTML always carries the
 * full stepper (the SEO/teaching content) and the collapse only happens after mount.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { distanceBetween } from "geofire-common";
import { Combobox } from "@/components/ui/Combobox";
import { Modal } from "@/components/ui/Modal";
import { StepTile } from "@/components/ui/StepTile";
import {
  AcademicCapIcon,
  HeartIcon,
  InfoIcon,
  MapPinIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { COMMUNITY_RADIUS_KM, getSchoolsCached } from "@/lib/firestore";
import { localityLabel } from "@/lib/location";
import type { SchoolDoc } from "@/types";

type SchoolsState = "loading" | "error" | "loaded";

export function BuyerStrip() {
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

  // A usable community is set (school chosen, or a location with schools nearby): the strip
  // collapses to a one-line summary and the trailing steps drop. locationWithoutSchools falls
  // through to the full stepper + an inline prompt, because the buyer still has to pick a
  // school from the list for the ranking to change.
  const showSummary = hasCommunity && !locationWithoutSchools;

  return (
    <>
      {showSummary ? (
        <CommunitySummary
          schoolName={prefs.schoolName}
          onChange={() => setOpen(true)}
          onClear={clear}
        />
      ) : (
        <ol className="relative mx-auto grid max-w-4xl gap-4 sm:grid-cols-3 sm:gap-6">
          {/* Stepper connector: a faint line linking the three icon centers so the steps
              read as a 1→2→3 flow, not three independent items. Desktop only (the mobile
              layout is a vertical row where the numbers carry the order). top-6 = the h-12
              icon's vertical center; insets stop at the outer icons. */}
          <span
            aria-hidden
            className="absolute left-[16.6%] right-[16.6%] top-6 hidden h-px bg-border sm:block"
          />
          {/* Step 1 is interactive (picks the buyer's community → drives the feed). */}
          <li className="flex items-start gap-3 text-left sm:flex-col sm:items-center sm:text-center">
            <StepTile step={1}>
              <AcademicCapIcon className="h-5 w-5" />
            </StepTile>
            <div className="w-full min-w-0 sm:mt-3">
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
          </li>
          <BuyerStep
            step={2}
            icon={<SearchIcon className="h-5 w-5" />}
            title="Descubrí los comercios que la apoyan"
          />
          <BuyerStep
            step={3}
            icon={<HeartIcon className="h-5 w-5" />}
            title="Comprá en ellos y apoyá tu institución"
          />
        </ol>
      )}

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
    </>
  );
}

// Viewport gutter, gap to the trigger, and max width of the explainer popover.
const INFO_MARGIN = 12;
const INFO_GAP = 8;
const INFO_MAX_W = 380;

/** Fixed-position style for the explainer, computed from the trigger's viewport rect. Near
 *  full width on mobile (capped on desktop) and flipped above/below the trigger toward
 *  whichever side has more room, so it is never clipped off the bottom edge. */
function infoPopoverStyle(rect: DOMRect): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw - 2 * INFO_MARGIN, INFO_MAX_W);
  const left = Math.max(
    INFO_MARGIN,
    Math.min(rect.left + rect.width / 2 - width / 2, vw - width - INFO_MARGIN),
  );
  // More space below than above → drop down (anchor top); otherwise rise up (anchor bottom,
  // so the box grows upward and never needs its height measured).
  return vh - rect.bottom >= rect.top
    ? { left, width, top: rect.bottom + INFO_GAP }
    : { left, width, bottom: vh - rect.top + INFO_GAP };
}

/** Collapsed state: once the buyer has a community the strip is a single line naming the
 *  school (or zone) plus Cambiar/Limpiar — kept short so it doesn't eat vertical space on
 *  mobile. The leading icon is an info affordance: tapping it reveals the full ordering
 *  explainer (the list is *ranked* by relevance, not filtered). No "Donar" CTA here — the
 *  strip's job is to reflect the active community, not to branch into the donation flow. */
function CommunitySummary({
  schoolName,
  onChange,
  onClear,
}: {
  schoolName?: string;
  onChange: () => void;
  onClear: () => void;
}) {
  const [info, setInfo] = useState<React.CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = schoolName ?? "tu zona";
  const showInfo = info !== null;

  const openInfo = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setInfo(infoPopoverStyle(rect));
  };

  // While open: keep the popover glued to the trigger across scroll/resize (its best side can
  // change as the trigger moves), and close it on outside tap / Escape. mousedown (not click)
  // so it also fires for the synthesized touch events on mobile.
  useEffect(() => {
    if (!showInfo) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setInfo(infoPopoverStyle(rect));
    };
    const onDocPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setInfo(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfo(null);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [showInfo]);

  return (
    <div
      ref={ref}
      className="mx-auto flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center"
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (showInfo ? setInfo(null) : openInfo())}
        aria-label="Cómo se ordena esta lista"
        aria-expanded={showInfo}
        className="shrink-0 rounded-full text-brand-dark transition-colors hover:text-brand-darker"
      >
        <InfoIcon className="h-5 w-5" />
      </button>

      <span className="min-w-0 font-semibold text-foreground">{name}</span>

      <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
        <button
          type="button"
          onClick={onChange}
          className="font-medium text-brand-darker hover:underline"
        >
          Cambiar
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={onClear}
          className="font-medium text-brand-darker hover:underline"
        >
          Limpiar
        </button>
      </span>

      {info && (
        // Fixed to the viewport (not the row) so it can't be clipped by the section and so
        // its width is independent of the centered, content-width row.
        <p
          role="status"
          style={info}
          className="fixed z-30 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm leading-relaxed text-muted shadow-lg"
        >
          Estás viendo la lista de comercios ordenados de mayor a menor relevancia para{" "}
          <span className="font-medium text-foreground">{name}</span>.
        </p>
      )}
    </div>
  );
}

/** A static buyer "how it works" step (2–3) on the home value strip: numbered icon tile +
 *  title. The number badge + the connector line behind the icons (see the <ol> above) make
 *  the three read as an ordered flow. Compact: a horizontal row on mobile (icon left, text
 *  right) to keep the strip short; recenters into a column on the 3-up grid (sm+). */
function BuyerStep({
  step,
  icon,
  title,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <li className="flex items-start gap-3 text-left sm:flex-col sm:items-center sm:text-center">
      <StepTile step={step}>{icon}</StepTile>
      <div className="min-w-0 sm:mt-3">
        <h3 className="font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
    </li>
  );
}
