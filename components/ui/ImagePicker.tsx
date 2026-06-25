"use client";

/**
 * Image file picker with a shaped preview that mirrors how the image will look on the
 * public business page: "avatar" renders a circle (the profile logo), "cover" a wide
 * 5:2 band (the header cover). Local-only: it holds a File and previews it via an
 * object URL — the caller uploads on submit. Type/size are validated here so the form
 * only ever receives usable files.
 */
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_IMAGE_MB = 5;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

/**
 * User-facing error for an unusable image file, or null when it's fine. Shared with
 * other image inputs (e.g. the gallery manager) so every upload validates alike.
 */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "El archivo debe ser una imagen (JPG, PNG…).";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `La imagen no puede superar los ${MAX_IMAGE_MB} MB.`;
  }
  return null;
}

export function ImagePicker({
  label,
  hint,
  value,
  onChange,
  variant,
  hidePreviewWhenEmpty = false,
  pickLabel = "Subir imagen",
  hideLabel = false,
  onRemoveExisting,
  removeLabel = "Quitar",
}: {
  label: string;
  hint?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  variant: "avatar" | "cover";
  /** Cover variant only: when no file is picked, render JUST the button (no empty 5:2 band). For edit
   * surfaces that already show the CURRENT cover separately, where the empty band is wasted space. The
   * band still appears once a new file is picked, to preview it. */
  hidePreviewWhenEmpty?: boolean;
  /** Button label when no file is picked yet. Defaults to "Subir imagen"; a replace surface can pass
   * e.g. "Cambiar portada". */
  pickLabel?: string;
  /** Hide the visible label (and let the caller drop the hint). The input keeps `label` as its
   * aria-label for accessibility. Used where the surrounding UI already names the field. */
  hideLabel?: boolean;
  /** Action to remove the CURRENT (already-saved) image — owned by the caller, since this picker only
   * holds the newly-picked file. When given, a text action (`removeLabel`) sits next to the pick
   * button in the empty `hidePreviewWhenEmpty` state. The caller typically confirms before deleting. */
  onRemoveExisting?: () => void;
  /** Label for the `onRemoveExisting` action (e.g. "Eliminar portada"). */
  removeLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The preview URL is derived from the file; the effect only REVOKES the stale URL
  // on replace/unmount (each createObjectURL pins the blob in memory until revoked).
  const previewUrl = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

  const remove = () => {
    setError(null);
    onChange(null);
    // Clear the native input so re-picking the same file still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  };

  // The upload control on its own, so the cover variant can place it centered INSIDE the empty band
  // (no image yet) instead of below it. The other cases keep it in the controls row.
  const uploadButton = (
    <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
      {value ? "Cambiar imagen" : pickLabel}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={label}
        onChange={onFile}
      />
    </label>
  );

  const preview =
    variant === "avatar" ? (
      <span className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-full bg-surface ring-1 ring-black/5">
        {previewUrl ? (
          // unoptimized: blob: object URLs can't go through the image optimizer.
          <Image
            src={previewUrl}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted">
            Sin imagen
          </span>
        )}
      </span>
    ) : (
      <span className="relative block aspect-[5/2] w-full overflow-hidden rounded-xl bg-surface ring-1 ring-black/5">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          // No cover yet: the upload button sits centered, overlaid on the empty band.
          <span className="absolute inset-0 flex items-center justify-center">
            {uploadButton}
          </span>
        )}
      </span>
    );

  const controls = (
    <span className="flex items-center gap-3">
      {uploadButton}
      {value && (
        <button
          type="button"
          onClick={remove}
          className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
        >
          Quitar
        </button>
      )}
    </span>
  );

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {!hideLabel && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {/* Avatar: circle and controls side by side. Cover: band on top, controls below — except when
          empty with hidePreviewWhenEmpty, which shows just the button (no band). */}
      {variant === "avatar" ? (
        <span className="mt-1 flex items-center gap-4">
          {preview}
          {controls}
        </span>
      ) : !value && hidePreviewWhenEmpty ? (
        // Empty + the current cover is shown elsewhere → just the pick button (plus an optional
        // "remove existing" text action), no wasted 5:2 band.
        <span className="mt-1 flex items-center gap-3">
          {uploadButton}
          {onRemoveExisting && (
            <button
              type="button"
              onClick={onRemoveExisting}
              className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
            >
              {removeLabel}
            </button>
          )}
        </span>
      ) : (
        <span className="mt-1 flex flex-col gap-3">
          {preview}
          {/* With an image, the Cambiar/Quitar controls sit below; with none, the upload button is
              already centered inside the band, so nothing goes here. */}
          {value && controls}
        </span>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
