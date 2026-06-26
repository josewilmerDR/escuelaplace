"use client";

/**
 * The presentational inputs of ONE pageant ("Reinado") candidate — its presentation media, name, bio
 * and the human jury score — used by the shared roster editor (PageantCandidatesEditor), which both
 * the create and edit pages mount. Pure presentation: it owns no save/dirty state and never touches
 * Firestore — the parent decides when and how the values are persisted (uploading the picked files on
 * save and writing the ordered `media` list).
 *
 * The media block is an ORDERED carousel of up to 5 images plus at most 1 short video (≤ 1 min). The
 * owner adds several photos at once (multi-select), adds/replaces the video, reorders every element
 * with ↑/↓ buttons, and removes any of them. Order matters: the FIRST image is the public avatar
 * "Portada". Files are held locally (previewed via object URLs) and uploaded by the parent on save.
 * PURELY INFORMATIONAL — the platform never processes money.
 */
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/ui/Field";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlayIcon,
  XMarkIcon,
} from "@/components/ui/icons";
import { validateImageFile } from "@/components/ui/ImagePicker";
import { validateVideoFile, videoDurationSeconds } from "@/lib/files";
import {
  PAGEANT_CANDIDATE_BIO_MAX,
  PAGEANT_CANDIDATE_NAME_MAX,
  PAGEANT_CANDIDATE_PHOTOS_MAX,
  PAGEANT_JURY_SCORE_MAX,
  TOOL_VIDEO_MAX_MB,
  TOOL_VIDEO_MAX_SECONDS,
} from "@/types";

/** Clamp the jury-score input to the integer 0..100 the rules require (blank/garbage → 0). */
export function clampScore(value: string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(PAGEANT_JURY_SCORE_MAX, Math.max(0, n));
}

/**
 * One element of a candidate's carousel as the editor holds it: a stable local `_key`, its kind, and
 * EITHER an already-uploaded `url` (existing media) OR a freshly picked `file` (uploaded on save).
 */
export interface MediaDraft {
  _key: number;
  type: "image" | "video";
  /** The saved Storage URL, if this element is already persisted. */
  url?: string;
  /** A newly picked file, not yet uploaded — previewed locally and uploaded by the parent on save. */
  file?: File;
}

// Shared monotonic counter for stable React keys across every candidate's media list (parent-seeded
// drafts and freshly picked ones both draw from it, so keys never collide). Keys aren't serialized to
// the DOM, so a module-level counter is hydration-safe. No Math.random/Date.now (repo convention).
let mediaKeySeq = 0;
export function nextMediaKey(): number {
  return mediaKeySeq++;
}

/** The editable values of one candidate, as the inputs hold them (jury score is a string here). */
export interface CandidateFieldsValue {
  name: string;
  bio: string;
  juryScore: string;
  /** Ordered carousel drafts (≤ 5 images + ≤ 1 video). The first image is the public "Portada". */
  media: MediaDraft[];
}

/**
 * One carousel element's square thumbnail. An image shows its preview (the picked file's object URL,
 * or the saved URL); a video shows a static play tile WITHOUT loading any bytes. The object URL is
 * revoked on replace/unmount (each createObjectURL pins the blob until revoked).
 */
function MediaThumb({ draft }: { draft: MediaDraft }) {
  const objectUrl = useMemo(
    () =>
      draft.file && draft.type === "image" ? URL.createObjectURL(draft.file) : null,
    [draft.file, draft.type],
  );
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (draft.type === "video") {
    return (
      <span className="flex h-full w-full items-center justify-center bg-black/85 text-white">
        <PlayIcon className="h-7 w-7" />
      </span>
    );
  }
  const src = objectUrl ?? draft.url ?? null;
  return src ? (
    // unoptimized for blob: object URLs (can't go through the image optimizer).
    <Image
      src={src}
      alt=""
      fill
      unoptimized={objectUrl !== null}
      sizes="120px"
      className="object-cover"
    />
  ) : null;
}

/**
 * The candidate's media manager: the ordered thumbnail strip plus the "Agregar fotos" (multi-select)
 * and "Agregar/Cambiar video" controls. Holds nothing itself — every change is emitted through
 * `onChange(media)`; the parent stages it and persists on save.
 */
function CandidateMedia({
  media,
  onChange,
}: {
  media: MediaDraft[];
  onChange: (media: MediaDraft[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const imageCount = media.filter((m) => m.type === "image").length;
  const hasVideo = media.some((m) => m.type === "video");
  // The cover = the first image of the list (the public avatar). Badge that tile as "Portada".
  const coverKey = media.find((m) => m.type === "image")?._key;

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= media.length) return;
    const next = media.slice();
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  const remove = (key: number) => {
    setError(null);
    onChange(media.filter((m) => m._key !== key));
  };

  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Clear the native input so re-picking the same files still fires onChange.
    e.target.value = "";
    if (files.length === 0) return;

    let invalid = 0;
    const valid: File[] = [];
    for (const f of files) {
      if (validateImageFile(f)) invalid++;
      else valid.push(f);
    }
    const slots = PAGEANT_CANDIDATE_PHOTOS_MAX - imageCount;
    const taken = valid.slice(0, Math.max(0, slots));
    const overflow = valid.length - taken.length;

    if (taken.length > 0) {
      onChange([
        ...media,
        ...taken.map((file) => ({ _key: nextMediaKey(), type: "image" as const, file })),
      ]);
    }
    const reasons: string[] = [];
    if (invalid > 0) reasons.push(`${invalid} no es una imagen válida`);
    if (overflow > 0) reasons.push(`máximo ${PAGEANT_CANDIDATE_PHOTOS_MAX} fotos`);
    setError(reasons.length ? `Se omitieron algunos archivos (${reasons.join("; ")}).` : null);
  };

  const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const typeError = validateVideoFile(file, TOOL_VIDEO_MAX_MB);
    if (typeError) return setError(typeError);
    let duration: number;
    try {
      duration = await videoDurationSeconds(file);
    } catch {
      return setError("No pudimos leer el video. Prueba con otro archivo.");
    }
    // A small tolerance so a 60.0s clip isn't rejected on rounding (mirrors ToolItemCard).
    if (duration > TOOL_VIDEO_MAX_SECONDS + 2) {
      return setError(`El video debe durar máximo ${TOOL_VIDEO_MAX_SECONDS} segundos.`);
    }
    setError(null);
    const existingIndex = media.findIndex((m) => m.type === "video");
    if (existingIndex >= 0) {
      // Replace the current video in place (keep its key + position), now backed by the new file.
      onChange(
        media.map((m, i) =>
          i === existingIndex ? { ...m, file, url: undefined } : m,
        ),
      );
    } else {
      onChange([...media, { _key: nextMediaKey(), type: "video", file }]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">Fotos y video</span>
      <span className="text-xs text-muted">
        Hasta {PAGEANT_CANDIDATE_PHOTOS_MAX} fotos y 1 video (máx. {TOOL_VIDEO_MAX_SECONDS}{" "}
        segundos). Usa ↑/↓ para ordenar el carrusel; la primera foto es la portada.
      </span>

      {media.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {media.map((draft, i) => (
            <li key={draft._key} className="flex flex-col gap-1">
              <span className="relative block aspect-square overflow-hidden rounded-xl bg-surface ring-1 ring-black/5">
                <MediaThumb draft={draft} />
                {draft._key === coverKey && (
                  <span className="absolute left-1 top-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                    Portada
                  </span>
                )}
                {draft.type === "video" && (
                  <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                    Video
                  </span>
                )}
              </span>
              {/* Reorder (↑/↓) on the left, remove (×) on the right. min-h-9 for comfy tap targets. */}
              <div className="flex items-center justify-between">
                <span className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Mover elemento ${i + 1} hacia arriba`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === media.length - 1}
                    aria-label={`Mover elemento ${i + 1} hacia abajo`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => remove(draft._key)}
                  aria-label={`Quitar elemento ${i + 1}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-error"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {imageCount < PAGEANT_CANDIDATE_PHOTOS_MAX && (
          <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
            Agregar fotos
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="Agregar fotos"
              onChange={onPickPhotos}
            />
          </label>
        )}
        <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
          {hasVideo ? "Cambiar video" : "Agregar video"}
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            aria-label={hasVideo ? "Cambiar video" : "Agregar video"}
            onChange={onPickVideo}
          />
        </label>
      </div>

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
      <CandidateMedia
        media={value.media}
        onChange={(media) => onPatch({ media })}
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
