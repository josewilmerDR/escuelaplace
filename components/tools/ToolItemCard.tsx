"use client";

/**
 * One editable item card shared by every media-bearing item — a guided-tour stage, a sale
 * product, a service, an event gallery AND a project crowdfunding stage. It owns the parts that
 * were byte-for-byte identical across them: the fieldset shell (legend + "Quitar …" button), the
 * per-card busy/error state, and the whole media block (a photo grid with add/remove, plus one
 * short video with add/remove). The type-specific text fields (title/name, description, price, …)
 * are passed as `children`, so each kind keeps only what actually differs.
 *
 * Uploads go through `uploadAsset`. It defaults to the tool Storage path (uploadToolStageAsset
 * with the `schoolId`/`toolId` props), so every existing tool caller is unchanged; the project
 * stage editor passes its own (uploadProjectAsset) and omits the tool ids, reusing the same block.
 *
 * Media persists IMMEDIATELY against the SAVED item: each add/remove calls `onMedia` (the parent's
 * partial write), so an in-progress, unsaved text edit elsewhere on the form is never dragged
 * along. An item that isn't persisted yet (`persisted === false`) can't receive media — the upload
 * controls are replaced by `unsavedHint` until the item is saved. Each file input stops its change
 * event from bubbling, so an immediate-persist upload never trips the form's "unsaved changes"
 * dirty-tracker.
 */
import Image from "next/image";
import { useState } from "react";
import { validateImageFile } from "@/components/ui/ImagePicker";
import { cardClass } from "@/components/ui/Card";
import { XMarkIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { validateVideoFile, videoDurationSeconds } from "@/lib/files";
import { uploadToolStageAsset } from "@/lib/firestore";
import { TOOL_VIDEO_MAX_MB, TOOL_VIDEO_MAX_SECONDS } from "@/types";

export interface ToolItemCardProps {
  /** Card legend, e.g. "Servicio 1". */
  title: string;
  /** Remove-button label, e.g. "Quitar servicio". */
  removeLabel: string;
  /** Whether the remove button shows (hidden when it's the only item). */
  canRemove: boolean;
  onRemove: () => void;
  /** The item's current photos (URLs already in Storage). */
  photos: string[];
  /** The item's current video URL, if any. */
  videoUrl?: string;
  /** Max photos for this kind (TOUR_STAGE_PHOTO_MAX / SALE_PRODUCT_PHOTO_MAX / SERVICE_PHOTO_MAX). */
  photoMax: number;
  /** School + tool ids for the DEFAULT (tool) uploader. Omit when passing a custom `uploadAsset`. */
  schoolId?: string;
  toolId?: string;
  /** Upload one photo/video and return its public URL. Defaults to the tool Storage path
   * (uploadToolStageAsset with schoolId/toolId); the project stage editor passes uploadProjectAsset. */
  uploadAsset?: (kind: "photo" | "video", file: File) => Promise<string>;
  /** Whether this item is saved in Firestore; an unsaved item can't receive media. */
  persisted: boolean;
  /** Shown in place of the upload controls when `persisted === false`. */
  unsavedHint: string;
  /** Persist a media change immediately. `videoUrl: null` clears the video. */
  onMedia: (media: {
    photos?: string[];
    videoUrl?: string | null;
  }) => Promise<void>;
  /** The kind-specific text fields (title/name, description, price, …). */
  children: React.ReactNode;
}

export function ToolItemCard({
  title,
  removeLabel,
  canRemove,
  onRemove,
  photos,
  videoUrl,
  photoMax,
  schoolId,
  toolId,
  uploadAsset,
  persisted,
  unsavedHint,
  onMedia,
  children,
}: ToolItemCardProps) {
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Default to the tool Storage path; a caller (e.g. the project stage editor) can override it.
  // Only reached when `uploadAsset` is absent, which is exactly when schoolId/toolId are passed.
  const upload =
    uploadAsset ??
    ((kind: "photo" | "video", file: File) =>
      uploadToolStageAsset(schoolId as string, toolId as string, kind, file));

  // Wrap a media op so upload/save failures report inline and the busy gate prevents a double-fire.
  const run = async (op: () => Promise<void>, fallback: string) => {
    setMediaError(null);
    setBusy(true);
    try {
      await op();
    } catch (err) {
      setMediaError(userErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = (file: File) =>
    run(async () => {
      const url = await upload("photo", file);
      await onMedia({ photos: [...photos, url] });
    }, "No se pudo subir la foto.");

  const removePhoto = (url: string) =>
    run(
      () => onMedia({ photos: photos.filter((p) => p !== url) }),
      "No se pudo quitar la foto.",
    );

  const setVideo = (file: File) =>
    run(async () => {
      const url = await upload("video", file);
      await onMedia({ videoUrl: url });
    }, "No se pudo subir el video.");

  const removeVideo = () =>
    run(() => onMedia({ videoUrl: null }), "No se pudo quitar el video.");

  return (
    <fieldset className={`${cardClass("elevated", false)} p-4`}>
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </legend>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
          >
            {removeLabel}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {children}

        {/* Photos */}
        <div>
          <p className="text-xs font-medium">
            Fotos ({photos.length}/{photoMax})
          </p>
          {photos.length > 0 && (
            <ul className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((url, pi) => (
                <li key={url} className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface ring-1 ring-black/5">
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${pi + 1}`}
                    disabled={busy}
                    onClick={() => removePhoto(url)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < photoMax &&
            (persisted ? (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    // This upload persists immediately, so its change event must NOT bubble to the
                    // form's onChange dirty-tracker (that would falsely warn "unsaved changes"
                    // though nothing is). Text fields still mark dirty as before.
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateImageFile(f);
                    if (v) return setMediaError(v);
                    addPhoto(f);
                  }}
                />
              </label>
            ) : (
              <p className="mt-1 text-xs text-muted">{unsavedHint}</p>
            ))}
        </div>

        {/* Video (at most one per item). Only shown for a saved item or when one already exists;
            the photos hint above covers the unsaved case. */}
        {(persisted || videoUrl) && (
          <div>
            <p className="text-xs font-medium">Video (máx. 1 min)</p>
            {videoUrl ? (
              <div className="mt-1 flex flex-col gap-1">
                <video
                  controls
                  preload="metadata"
                  className="w-full rounded-lg bg-black ring-1 ring-black/5"
                >
                  <source src={videoUrl} />
                </video>
                <button
                  type="button"
                  disabled={busy}
                  onClick={removeVideo}
                  className="inline-flex min-h-10 items-center justify-center gap-1 self-start rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                  Quitar video
                </button>
              </div>
            ) : (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar video"}
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={async (e) => {
                    // Persists immediately — don't let it bubble to the form's dirty-tracker
                    // (see the photo input above).
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateVideoFile(f, TOOL_VIDEO_MAX_MB);
                    if (v) return setMediaError(v);
                    let duration: number;
                    try {
                      duration = await videoDurationSeconds(f);
                    } catch {
                      setMediaError(
                        "No pudimos leer el video. Probá con otro archivo.",
                      );
                      return;
                    }
                    if (duration > TOOL_VIDEO_MAX_SECONDS + 2) {
                      setMediaError(
                        `El video debe durar máximo ${TOOL_VIDEO_MAX_SECONDS} segundos.`,
                      );
                      return;
                    }
                    setVideo(f);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {mediaError && (
          <p role="alert" className="text-xs text-error">
            {mediaError}
          </p>
        )}
      </div>
    </fieldset>
  );
}
