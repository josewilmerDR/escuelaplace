"use client";

/**
 * Public-recognition preference (`donorProfiles/{uid}.isPublic` + `displayName`).
 *
 * This is an ACCOUNT-WIDE setting, not a per-donation one: a single toggle decides whether
 * the donor's name shows on EVERY school's thank-you wall, across recurring donations and
 * one-off project contributions alike (see getSchoolDonorWall). It therefore lives in one
 * shared place instead of being re-implemented per flow:
 *  - `compact` — a one-line, autosaving toggle for the donate/fund flows, linking out to the
 *    settings page for the display name.
 *  - full (default) — the settings page form, with the display-name field.
 *
 * It autosaves on every change (there is no separate save button): toggling persists at once;
 * the name persists on blur. The profile is created lazily (private by default) the first time
 * the donor opts in, so a brand-new donor needs no prior setup.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Field } from "@/components/ui/Field";
import { CheckIcon } from "@/components/ui/icons";
import {
  ensureDonorProfile,
  getDonorProfile,
  updateDonorRecognition,
} from "@/lib/firestore";

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveHint({
  state,
  className = "",
}: {
  state: SaveState;
  className?: string;
}) {
  if (state === "idle") return null;
  if (state === "saving")
    return <p className={`text-xs text-muted ${className}`}>Guardando…</p>;
  if (state === "error")
    return (
      <p className={`text-xs text-error ${className}`}>
        No se pudo guardar. Intentá de nuevo.
      </p>
    );
  return (
    <p
      className={`inline-flex items-center gap-1 text-xs text-success ${className}`}
    >
      <CheckIcon className="h-3.5 w-3.5" />
      Guardado
    </p>
  );
}

export function RecognitionToggle({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  // Last persisted name, so blur skips a no-op write when the field is untouched.
  const savedNameRef = useRef("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDonorProfile(user.id)
      .then((p) => {
        if (cancelled) return;
        const name = p?.displayName ?? user.name;
        setIsPublic(p?.isPublic ?? false);
        setDisplayName(name);
        savedNameRef.current = name;
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const persist = async (next: { isPublic?: boolean; displayName?: string }) => {
    setSave("saving");
    try {
      const update: { isPublic?: boolean; displayName?: string } = {};
      if (next.isPublic !== undefined) update.isPublic = next.isPublic;
      if (next.displayName !== undefined)
        update.displayName = next.displayName.trim() || user.name;
      // The profile is private-by-default and may not exist yet; create it before the
      // first write so updateDoc has a target.
      await ensureDonorProfile(
        user.id,
        update.displayName ?? (displayName.trim() || user.name),
      );
      await updateDonorRecognition(user.id, update);
      if (update.displayName !== undefined)
        savedNameRef.current = update.displayName;
      setSave("saved");
    } catch {
      setSave("error");
    }
  };

  const onToggle = (next: boolean) => {
    setIsPublic(next);
    // Opting in also persists the current name so the wall has something to show.
    void persist(next ? { isPublic: true, displayName } : { isPublic: false });
  };

  const onNameBlur = () => {
    const trimmed = displayName.trim() || user.name;
    if (trimmed === savedNameRef.current) return;
    void persist({ displayName: trimmed });
  };

  if (compact) {
    return (
      <div className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5">
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            id="recognition-public"
            checked={isPublic}
            disabled={!loaded}
            onChange={(e) => onToggle(e.target.checked)}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <label
              htmlFor="recognition-public"
              className="font-medium text-foreground"
            >
              Mostrar mi nombre en el muro de agradecimiento
            </label>
            <p className="mt-0.5 text-xs text-muted">
              Aplica a todas tus donaciones y aportes; por defecto sos anónimo.{" "}
              <Link
                href="/panel/settings"
                className="font-medium text-brand-darker hover:underline"
              >
                Configurar
              </Link>
            </p>
            <SaveHint state={save} className="mt-1" />
          </div>
        </div>
      </div>
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
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPublic}
            disabled={!loaded}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>Mostrar mi nombre en el muro de agradecimiento</span>
        </label>
        {isPublic && (
          <Field label="Nombre a mostrar">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={onNameBlur}
              maxLength={60}
              className="input"
            />
          </Field>
        )}
        <SaveHint state={save} />
      </div>
    </div>
  );
}
