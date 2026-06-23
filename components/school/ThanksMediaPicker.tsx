"use client";

/**
 * Optional media picker for a thank-you (a template, or a personalized milestone message):
 * one image OR one short video. Local-only — it holds a File and previews it via an object
 * URL, OR previews an already-saved URL when nothing new is picked; the caller uploads on
 * save (uploadThanksMedia). A short clip of the kids waving is the cheap-but-memorable gesture
 * the feature nudges schools toward, so video is a first-class option alongside a photo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TOOL_VIDEO_MAX_MB } from "@/types";

const MAX_IMAGE_MB = 5;

/** User-facing error for an unusable thank-you media file, or null when it's fine. */
export function validateThanksMediaFile(file: File): string | null {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    return "El archivo debe ser una imagen o un video.";
  }
  const maxMb = isVideo ? TOOL_VIDEO_MAX_MB : MAX_IMAGE_MB;
  if (file.size > maxMb * 1024 * 1024) {
    return isVideo
      ? `El video no puede superar los ${TOOL_VIDEO_MAX_MB} MB.`
      : `La imagen no puede superar los ${MAX_IMAGE_MB} MB.`;
  }
  return null;
}

export function ThanksMediaPicker({
  label = "Foto o video corto (opcional)",
  hint,
  file,
  existingUrl,
  existingKind,
  onPick,
  onRemove,
}: {
  label?: string;
  hint?: string;
  /** A newly picked file (takes precedence over `existingUrl` in the preview). */
  file: File | null;
  /** A previously saved media URL, shown when no new file is picked. */
  existingUrl?: string | null;
  existingKind?: "photo" | "video" | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const fileUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const validationError = validateThanksMediaFile(picked);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }
    setError(null);
    onPick(picked);
  };

  const remove = () => {
    setError(null);
    onRemove();
    if (inputRef.current) inputRef.current.value = "";
  };

  // Resolve what to preview: the new file (by its type), else the saved URL (by its kind).
  const previewUrl = fileUrl ?? existingUrl ?? null;
  const previewIsVideo = file
    ? file.type.startsWith("video/")
    : existingKind === "video";
  const hasMedia = previewUrl != null;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {hasMedia && (
        <div className="mt-1 overflow-hidden rounded-xl bg-surface ring-1 ring-black/5">
          {previewIsVideo ? (
            <video src={previewUrl!} controls className="max-h-56 w-full bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- blob:/storage URL, no optimization
            <img src={previewUrl!} alt="" className="max-h-56 w-full object-cover" />
          )}
        </div>
      )}
      <span className="mt-1 flex items-center gap-3">
        <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
          {hasMedia ? "Cambiar" : "Subir foto o video"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            aria-label={label}
            onChange={onFile}
          />
        </label>
        {hasMedia && (
          <button
            type="button"
            onClick={remove}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
          >
            Quitar
          </button>
        )}
      </span>
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
