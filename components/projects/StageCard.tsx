"use client";

/**
 * One editable project stage: the shared text fields (<StageFields>) plus its media — a photo
 * grid, one short video (rendered as a same-size thumbnail), and supporting documents (invoices,
 * quotes, promises of sale…). Shared by BOTH the create and edit project forms so the two stay
 * mirror images; the parent decides what each media/text change DOES via the callbacks:
 *  - edit page: `onMedia` persists immediately to Firestore (against the saved stage);
 *  - create page: `onMedia` merges into the local draft that rides along on the single create write.
 *
 * Uploads always go to the project's Storage path (`uploadProjectAsset`) — the create page
 * pre-allocates the project id so uploads work before the doc exists. `persisted` gates the upload
 * controls: a brand-new stage on the EDIT page has no slot in `project.stages` yet, so it can't
 * receive media until saved; the create page passes `persisted` for every stage (the id exists).
 */
import Image from "next/image";
import { useState } from "react";
import { StageFields } from "@/components/projects/StageFields";
import { cardClass } from "@/components/ui/Card";
import { validateImageFile } from "@/components/ui/ImagePicker";
import { XMarkIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import {
  validateProofFile,
  validateVideoFile,
  videoDurationSeconds,
} from "@/lib/files";
import { safeExternalUrl } from "@/lib/url";
import { uploadProjectAsset } from "@/lib/firestore";
import {
  PROJECT_STAGE_PHOTO_MAX,
  PROJECT_STAGE_QUOTE_MAX,
  TOOL_VIDEO_MAX_MB,
  TOOL_VIDEO_MAX_SECONDS,
  type ProjectCurrency,
  type ProjectStage,
} from "@/types";

/** The media delta a stage can persist; `videoUrl: null` clears the video, `undefined` leaves it. */
export interface StageMedia {
  photos?: string[];
  quoteUrls?: string[];
  videoUrl?: string | null;
}

export function StageCard({
  stage,
  index,
  currency,
  schoolId,
  projectId,
  canRemove,
  persisted,
  onText,
  onMedia,
  onRemove,
}: {
  stage: ProjectStage;
  index: number;
  currency: ProjectCurrency;
  schoolId: string;
  projectId: string;
  canRemove: boolean;
  /** Whether this stage can receive media yet (false = a brand-new, unsaved edit-page stage). */
  persisted: boolean;
  onText: (patch: Partial<ProjectStage>) => void;
  onMedia: (media: StageMedia) => Promise<void>;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const photos = stage.photos ?? [];
  const quotes = stage.quoteUrls ?? [];
  const videoUrl = stage.videoUrl;

  // Persist a media change for this stage, reporting upload/save failures inline.
  const commitMedia = async (media: StageMedia) => {
    setMediaError(null);
    setBusy(true);
    try {
      await onMedia(media);
    } catch (err) {
      setMediaError(userErrorMessage(err, "No se pudo guardar el cambio."));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File, kind: "photo" | "quote" | "video") => {
    setMediaError(null);
    setBusy(true);
    try {
      const url = await uploadProjectAsset(schoolId, projectId, kind, file);
      if (kind === "photo") {
        await onMedia({ photos: [...photos, url], quoteUrls: quotes });
      } else if (kind === "quote") {
        await onMedia({ photos, quoteUrls: [...quotes, url] });
      } else {
        await onMedia({ videoUrl: url });
      }
    } catch (err) {
      setMediaError(userErrorMessage(err, "No se pudo subir el archivo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Elevated calm-depth card per stage via the shared primitive (#9). cardClass's own
    // padding is opted out (padded=false) to keep this card's tighter p-4, since a stage
    // card nests inside the form rather than standing alone like a page section.
    <fieldset className={`${cardClass("elevated", false)} p-4`}>
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold tracking-tight text-foreground">
          Etapa {index + 1}
        </legend>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
          >
            Quitar etapa
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <StageFields
          title={stage.title}
          justification={stage.justification}
          cost={stage.cost}
          currency={currency}
          onChange={onText}
        />

        {/* Photos */}
        <div>
          <p className="text-xs font-medium">
            Fotos ({photos.length}/{PROJECT_STAGE_PHOTO_MAX})
          </p>
          {photos.length > 0 && (
            <ul className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((url, pi) => (
                <li key={url} className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface ring-1 ring-black/5">
                    <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${pi + 1}`}
                    disabled={busy}
                    onClick={() =>
                      commitMedia({
                        photos: photos.filter((p) => p !== url),
                        quoteUrls: quotes,
                      })
                    }
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < PROJECT_STAGE_PHOTO_MAX &&
            (persisted ? (
              // focus-within ring makes the sr-only file input's keyboard focus visible (#13).
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    // This upload persists immediately; stop the change event from bubbling to the
                    // form's onChange dirty-tracker (which would falsely warn "unsaved changes").
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateImageFile(f);
                    if (v) return setMediaError(v);
                    upload(f, "photo");
                  }}
                />
              </label>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Guarda la etapa para poder subir fotos, video y documentos.
              </p>
            ))}
        </div>

        {/* Video (at most one per stage). Shown for a saved stage or when one already exists; the
            photos hint above already covers the unsaved case. */}
        {(persisted || videoUrl) && (
          <div>
            <p className="text-xs font-medium">Video (máx. 1 min)</p>
            {videoUrl ? (
              // Same grid/cell as the photos so the video reads as one more media tile of the same
              // size, not a full-width player; object-cover crops it into the square like a thumbnail
              // (controls still let the board play it to check the clip).
              <ul className="mt-1 grid grid-cols-4 gap-2">
                <li className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-black ring-1 ring-black/5">
                    <video
                      controls
                      preload="metadata"
                      className="h-full w-full object-cover"
                    >
                      <source src={videoUrl} />
                    </video>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => commitMedia({ videoUrl: null })}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              </ul>
            ) : (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar video"}
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={async (e) => {
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
                        "No pudimos leer el video. Prueba con otro archivo.",
                      );
                      return;
                    }
                    if (duration > TOOL_VIDEO_MAX_SECONDS + 2) {
                      setMediaError(
                        `El video debe durar máximo ${TOOL_VIDEO_MAX_SECONDS} segundos.`,
                      );
                      return;
                    }
                    upload(f, "video");
                  }}
                />
              </label>
            )}
          </div>
        )}

        {/* Documents (invoices, quotes, promises of sale…) */}
        <div>
          <p className="text-xs font-medium">
            Documentos ({quotes.length}/{PROJECT_STAGE_QUOTE_MAX})
          </p>
          {quotes.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {quotes.map((url, qi) => {
                // Only render an http(s) link; a legacy/raw-written doc with a
                // javascript:/data: scheme stays inert text but is still removable (#15).
                const safeUrl = safeExternalUrl(url);
                return (
                  <li key={url} className="flex items-center gap-3 text-xs">
                    {safeUrl ? (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-darker underline"
                      >
                        Documento {qi + 1}
                      </a>
                    ) : (
                      <span className="font-medium text-muted">
                        Documento {qi + 1} (enlace inválido)
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Quitar documento ${qi + 1}`}
                      disabled={busy}
                      onClick={() =>
                        commitMedia({
                          photos,
                          quoteUrls: quotes.filter((q) => q !== url),
                        })
                      }
                      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* When the stage isn't persisted yet, the shared hint under "Fotos" already explains
              why uploads are off, so we just omit this control rather than repeating it (#3). */}
          {quotes.length < PROJECT_STAGE_QUOTE_MAX && persisted && (
            // focus-within ring exposes the sr-only file input's keyboard focus (#13).
            <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
              {busy ? "Subiendo…" : "Agregar documento (imagen o PDF)"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  e.stopPropagation();
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  // Validate type/size before upload, same as photos do (#19).
                  const v = validateProofFile(f);
                  if (v) return setMediaError(v);
                  upload(f, "quote");
                }}
              />
            </label>
          )}
        </div>

        {mediaError && (
          <p role="alert" className="text-xs text-error">
            {mediaError}
          </p>
        )}
      </div>
    </fieldset>
  );
}
