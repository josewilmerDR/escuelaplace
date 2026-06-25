"use client";

/**
 * The presentational inputs of ONE pageant ("Reinado") candidate — photo, name, bio and the human
 * jury score — shared by both roster surfaces: the edit page's per-row editor (PageantCandidatesEditor)
 * and the create form's draft collection (PageantCandidatesFields). Pure presentation: it owns no
 * save/dirty state and never touches Firestore — the parent decides when and how the values are
 * persisted.
 *
 * The photo is a single circular avatar that IS the file picker (CandidatePhoto): a "Cambiar" label
 * sits over a gradient at the bottom of the avatar, always visible, and tapping/clicking anywhere on
 * it opens the picker — so it works the same on desktop and touch. PURELY INFORMATIONAL — the platform
 * never processes money.
 */
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/ui/Field";
import { UserIcon } from "@/components/ui/icons";
import { validateImageFile } from "@/components/ui/ImagePicker";
import {
  PAGEANT_CANDIDATE_BIO_MAX,
  PAGEANT_CANDIDATE_NAME_MAX,
  PAGEANT_JURY_SCORE_MAX,
} from "@/types";

/** Clamp the jury-score input to the integer 0..100 the rules require (blank/garbage → 0). */
export function clampScore(value: string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(PAGEANT_JURY_SCORE_MAX, Math.max(0, n));
}

/** The editable values of one candidate, as the inputs hold them (jury score is a string here). */
export interface CandidateFieldsValue {
  name: string;
  bio: string;
  juryScore: string;
  /** The saved photo URL, if any (edit page); absent for a brand-new draft. */
  photoUrl?: string;
  /** A newly picked photo, not yet uploaded — previewed by the avatar and uploaded on persist. */
  photoFile: File | null;
}

/**
 * One candidate's photo: a circular avatar that IS the file picker. It shows the freshly picked file
 * (preview) or the saved photoUrl, falling back to a placeholder icon, with a "Cambiar" label over a
 * gradient at the bottom — always visible, so it reads as editable on both desktop and touch. The
 * hidden input lives inside the <label>, so clicking anywhere on the avatar opens the picker. Image
 * type/size is validated with the shared helper, so the parent only ever receives a usable File.
 */
function CandidatePhoto({
  photoUrl,
  photoFile,
  onChange,
}: {
  photoUrl?: string;
  photoFile: File | null;
  onChange: (file: File | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  // The preview URL is derived from the file; the effect only REVOKES the stale URL on
  // replace/unmount (each createObjectURL pins the blob in memory until revoked).
  const previewUrl = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const src = previewUrl ?? photoUrl ?? null;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }
    setError(null);
    onChange(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="relative block h-20 w-20 cursor-pointer overflow-hidden rounded-full bg-surface ring-1 ring-black/5">
        {src ? (
          // unoptimized for blob: object URLs (can't go through the image optimizer).
          <Image
            src={src}
            alt=""
            fill
            unoptimized={previewUrl !== null}
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted">
            <UserIcon className="h-8 w-8" />
          </span>
        )}
        {/* "Cambiar" label over a bottom gradient — always visible, the edit affordance on every device. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/70 to-transparent pb-1.5 pt-4 text-xs font-medium leading-none text-white">
          {src ? "Cambiar" : "Agregar"}
        </span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={src ? "Cambiar foto" : "Agregar foto"}
          onChange={onFile}
        />
      </label>
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function CandidateFields({
  value,
  onPatch,
  showJuryScore = true,
}: {
  value: CandidateFieldsValue;
  onPatch: (patch: Partial<CandidateFieldsValue>) => void;
  /** The human jury score is shown only where it's actually entered — the edit/coronación surface.
   * The create form hides it (the jury hasn't scored yet): new candidates are persisted with 0 and
   * the score is filled later. Defaults to shown. */
  showJuryScore?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CandidatePhoto
        photoUrl={value.photoUrl}
        photoFile={value.photoFile}
        onChange={(f) => onPatch({ photoFile: f })}
      />

      <Field label="Nombre">
        <input
          type="text"
          maxLength={PAGEANT_CANDIDATE_NAME_MAX}
          value={value.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="input"
          placeholder="Ej.: María Fernández, 6.º grado"
        />
      </Field>

      <Field label="Presentación (opcional)">
        <textarea
          rows={3}
          maxLength={PAGEANT_CANDIDATE_BIO_MAX}
          value={value.bio}
          onChange={(e) => onPatch({ bio: e.target.value })}
          className="input"
          placeholder="Por qué se postula, qué representa, su talento…"
        />
      </Field>

      {showJuryScore && (
        <>
          <Field label="Puntaje del jurado (0–100)">
            <input
              type="number"
              min={0}
              max={PAGEANT_JURY_SCORE_MAX}
              step={1}
              inputMode="numeric"
              value={value.juryScore}
              onChange={(e) => onPatch({ juryScore: e.target.value })}
              className="input"
            />
          </Field>
          <p className="-mt-2 text-xs text-muted">
            Alimenta la fórmula de la corona. Puedes ajustarlo cuando el jurado decida.
          </p>
        </>
      )}
    </div>
  );
}
