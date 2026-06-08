"use client";

/**
 * Lets the buyer choose their community — a school and/or their location — which is what
 * the explore feed uses to boost local supporters. State lives in localStorage (the buyer
 * has no account), so this writes through useBuyerPreferences; <ExploreFeed> subscribes to
 * the same store and re-ranks automatically when this changes.
 */
import { useEffect, useState } from "react";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { getSchools } from "@/lib/firestore";
import type { SchoolDoc } from "@/types";

export function CommunityPicker() {
  const { prefs, ready, update } = useBuyerPreferences();
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchools()
      .then(setSchools)
      .catch(() => setSchools([]));
  }, []);

  const onSchool = (id: string) => {
    const school = schools.find((s) => s.id === id);
    update({ ...prefs, schoolId: id || undefined, schoolName: school?.name });
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
      },
      () => {
        setError("No pudimos obtener tu ubicación.");
        setLocating(false);
      },
    );
  };

  const clear = () => update({});

  const hasCommunity = ready && (prefs.schoolId || prefs.location);

  return (
    <div className="mb-8 rounded-2xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-slate-900">Tu comunidad</p>
      <p className="mt-1 text-sm text-muted">
        Elegí tu escuela o activá tu ubicación para ver primero los comercios que la
        apoyan.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={ready ? (prefs.schoolId ?? "") : ""}
          onChange={(e) => onSchool(e.target.value)}
          className="input flex-1"
          aria-label="Tu escuela"
        >
          <option value="">Elegí tu escuela…</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="shrink-0 rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-tint disabled:opacity-50"
        >
          {locating ? "Ubicando…" : "Usar mi ubicación"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {hasCommunity && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <span>
            {prefs.schoolName
              ? `Mostrando primero quienes apoyan a ${prefs.schoolName}`
              : "Mostrando primero quienes apoyan cerca de tu ubicación"}
          </span>
          <button
            type="button"
            onClick={clear}
            className="font-medium text-brand-dark hover:underline"
          >
            Limpiar
          </button>
        </p>
      )}
    </div>
  );
}
