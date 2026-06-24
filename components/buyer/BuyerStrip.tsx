"use client";

/**
 * The home "how it works" value strip, made stateful around the buyer's community.
 *
 * First visit (no community set): a single interactive prompt to pick a school in a modal or
 * activate location → drives the feed ranking. Once the buyer has a community the strip
 * collapses to a single line naming the chosen school (or zone) with Cambiar/Limpiar.
 *
 * The buyer has no account, so the community lives in localStorage via useBuyerPreferences;
 * <RankedFeed> reads the same store and re-ranks automatically when it changes.
 *
 * `ready` is false on the server and first client paint, so the SSR HTML always carries the
 * prompt and the collapse only happens after mount.
 */
import { useEffect, useRef, useState } from "react";
import { Combobox } from "@/components/ui/Combobox";
import { Modal } from "@/components/ui/Modal";
import { InfoIcon, MapPinIcon } from "@/components/ui/icons";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { getSchoolsCached } from "@/lib/firestore";
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
        // Close on success: a chosen location is a usable community on its own (it drives the
        // nearest-schools block and the proximity ordering), so the strip collapses to the
        // summary.
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

  // A usable community is set (a chosen school, or just a location): the strip collapses to a
  // one-line summary and the trailing steps drop. A location with no school within the radius is
  // still useful — it drives the nearest-schools block and the proximity ordering below — so it
  // no longer falls through to a "no schools nearby" prompt.
  const showSummary = hasCommunity;

  return (
    <>
      {showSummary ? (
        <CommunitySummary
          schoolName={prefs.schoolName}
          onChange={() => setOpen(true)}
          onClear={clear}
        />
      ) : (
        // The buyer's first action: pick a community (a school, or just a location) to drive
        // the feed ranking. Centered single prompt — no stepper, since it's the only step.
        <div className="mx-auto max-w-xl text-center">
          <div className="w-full min-w-0">
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
            {error && !open && (
              <p role="alert" className="mt-0.5 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>
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
