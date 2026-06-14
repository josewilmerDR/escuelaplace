"use client";

/**
 * Public-recognition preference (`donorProfiles/{uid}.isPublic` + `displayName`).
 *
 * This is an ACCOUNT-WIDE setting, not a per-donation one: a single toggle decides whether
 * the donor's name shows on EVERY school's thank-you wall, across recurring donations and
 * one-off project contributions alike (see getSchoolDonorWall). It therefore lives in one
 * shared place instead of being re-implemented per flow:
 *  - `compact` — a one-line, autosaving toggle for the donate/fund flows. The display name is
 *    edited inline (no jump to settings, which would discard the half-filled donation form).
 *  - full (default) — the settings page form.
 *
 * It autosaves on every change (there is no separate save button): toggling persists at once;
 * the name persists on blur. The profile is created lazily (private by default) the first time
 * the donor opts in, so a brand-new donor needs no prior setup. Writes are sequenced so rapid
 * toggles can't land out of order, and a failed toggle is rolled back so the control never
 * shows a state the server didn't accept.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Field } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { CheckIcon } from "@/components/ui/icons";
import {
  ensureDonorProfile,
  getDonorProfile,
  updateDonorRecognition,
} from "@/lib/firestore";
import { DISPLAY_NAME_MAX } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Autosave feedback. A single always-present `aria-live` region (so a screen reader announces
 * every transition) with a reserved height (so the surrounding form doesn't jump as it shows
 * and clears). The "saved" pill mirrors SavedIndicator deliberately — same treatment as the
 * manual-save forms — rather than nesting that component's own `role="status"` inside this one.
 */
function SaveHint({
  state,
  className = "",
}: {
  state: SaveState;
  className?: string;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex min-h-5 items-center text-xs ${className}`}
    >
      {state === "saving" && <span className="text-muted">Guardando…</span>}
      {state === "error" && (
        <span className="text-error">No se pudo guardar. Intentá de nuevo.</span>
      )}
      {state === "saved" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-1 font-medium text-success ring-1 ring-success/10">
          <CheckIcon className="h-3.5 w-3.5" />
          Guardado
        </span>
      )}
    </p>
  );
}

export function RecognitionToggle({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const labelId = useId();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isPublic, setIsPublic] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  // Last persisted name, so blur skips a no-op write when the field is untouched.
  const savedNameRef = useRef("");
  // Whether the profile doc is known to exist, so we skip the redundant ensure read after
  // the first opt-in (ensureDonorProfile itself does a getDoc before deciding).
  const profileEnsuredRef = useRef(false);
  // Monotonic write id: only the latest persist may apply its result, so overlapping writes
  // (toggle spam, toggle-then-blur) settle to last-dispatched, not last-resolved.
  const reqRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Reading our OWN profile: a denied/network error is real (not "you're anonymous"), so
    // surface it instead of silently showing the toggle off.
    getDonorProfile(user.id, { surfaceErrors: true })
      .then((p) => {
        if (cancelled) return;
        const name = p?.displayName ?? user.name;
        setIsPublic(p?.isPublic ?? false);
        setDisplayName(name);
        savedNameRef.current = name;
        profileEnsuredRef.current = p != null;
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, reloadKey]);

  // Let "Guardado" read as a transient confirmation, not a permanent label.
  useEffect(() => {
    if (save !== "saved") return;
    const t = setTimeout(() => setSave("idle"), 2500);
    return () => clearTimeout(t);
  }, [save]);

  if (!user) return null;

  const persist = async (
    update: { isPublic?: boolean; displayName?: string },
    rollback?: () => void,
  ) => {
    const reqId = ++reqRef.current;
    setSave("saving");
    try {
      const payload: { isPublic?: boolean; displayName?: string } = {};
      if (update.isPublic !== undefined) payload.isPublic = update.isPublic;
      if (update.displayName !== undefined)
        payload.displayName = update.displayName.trim() || user.name;
      // The profile is private-by-default and may not exist yet; create it before the
      // first write so updateDoc has a target (skipped once we know it exists).
      if (!profileEnsuredRef.current) {
        await ensureDonorProfile(
          user.id,
          payload.displayName ?? (displayName.trim() || user.name),
        );
        profileEnsuredRef.current = true;
      }
      await updateDonorRecognition(user.id, payload);
      if (reqRef.current !== reqId) return; // a newer write superseded this one
      if (payload.displayName !== undefined)
        savedNameRef.current = payload.displayName;
      setSave("saved");
    } catch {
      if (reqRef.current !== reqId) return;
      rollback?.();
      setSave("error");
    }
  };

  const onToggle = (next: boolean) => {
    const prev = isPublic;
    setIsPublic(next);
    // Opting in also persists the current name so the wall has something to show. On failure
    // we roll the toggle back so it never shows opted-in while the server stayed private.
    void persist(
      next ? { isPublic: true, displayName } : { isPublic: false },
      () => setIsPublic(prev),
    );
  };

  const onNameBlur = () => {
    const trimmed = displayName.trim() || user.name;
    if (trimmed === savedNameRef.current) return;
    void persist({ displayName: trimmed });
  };

  // Re-run the load from a clean slate (back to skeleton) after a failed read.
  const reload = () => {
    setLoaded(false);
    setLoadError(false);
    setReloadKey((k) => k + 1);
  };

  const controls = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Switch
          checked={isPublic}
          onChange={onToggle}
          disabled={!loaded}
          aria-labelledby={labelId}
        />
        <div className="min-w-0">
          <span id={labelId} className="text-sm font-medium text-foreground">
            Mostrar mi nombre en el muro de agradecimiento
          </span>
          {compact && (
            <p className="mt-0.5 text-xs text-muted">
              Aplica a todas tus donaciones y aportes a proyectos; por defecto
              sos anónimo.
            </p>
          )}
        </div>
      </div>
      {isPublic && (
        <Field label="Nombre a mostrar">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={onNameBlur}
            maxLength={DISPLAY_NAME_MAX}
            className="input"
          />
        </Field>
      )}
      <SaveHint state={save} />
    </div>
  );

  const skeleton = (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-border/70" />
        <div className="h-4 w-56 animate-pulse rounded bg-border/70" />
      </div>
    </div>
  );

  const error = (
    <div className="text-sm">
      <p className="text-error">No pudimos cargar tu preferencia.</p>
      <button
        type="button"
        onClick={reload}
        className="mt-2 font-medium text-brand-darker hover:underline"
      >
        Reintentar
      </button>
    </div>
  );

  const body = !loaded ? skeleton : loadError ? error : controls;
  const card = (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">{body}</div>
  );

  if (compact) {
    return (
      <>
        {!loaded && (
          <p className="sr-only" role="status">
            Cargando preferencia de reconocimiento…
          </p>
        )}
        {card}
      </>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Reconocimiento público
      </h2>
      <p className="mt-1 text-sm text-muted">
        Por defecto tus aportes son anónimos: contás en los totales de la
        escuela, pero tu nombre no se publica. Si querés, podés aparecer en el
        muro de agradecimiento con tu nivel de donante. Aplica a todas tus
        donaciones y aportes a proyectos.
      </p>
      <div className="mt-4">{card}</div>
    </div>
  );
}
