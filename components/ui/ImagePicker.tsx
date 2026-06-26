"use client";

/**
 * Image file picker with a shaped preview that mirrors how the image will look on the
 * public business page: "avatar" renders a circle (the profile logo), "cover" a wide
 * 5:2 band (the header cover). Local-only: it holds a File and previews it via an
 * object URL — the caller uploads on submit. Type/size are validated here so the form
 * only ever receives usable files.
 *
 * Two presentations:
 *  - default (create surfaces, no saved image): the picker only knows the newly-picked
 *    File, so an empty avatar shows "Sin imagen" and the cover band hosts the upload
 *    button.
 *  - integrated (`currentUrl` passed, even as null): edit surfaces where an image may
 *    already be saved. The preview shows the saved image (or the freshly-picked File on
 *    top) directly, with an "Agregar"/"Cambiar" affordance and — for covers — a remove
 *    action, so the preview is never a misleading empty box next to a live image.
 */
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";

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
  currentUrl,
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
   * button in the empty `hidePreviewWhenEmpty` state, and (in integrated mode) under/over the cover
   * preview. The caller typically confirms before deleting. */
  onRemoveExisting?: () => void;
  /** Label for the `onRemoveExisting` action (e.g. "Eliminar portada"). */
  removeLabel?: string;
  /** Integrated mode: the already-saved image URL (edit surfaces). Passing it (even as null) switches
   * the picker to show the saved image — or the freshly-picked File on top — inside the preview, with
   * an "Agregar"/"Cambiar" affordance, instead of an empty box. Omit it (undefined) to keep the default
   * presentation used by create forms. */
  currentUrl?: string | null;
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

  // Integrated mode is opt-in: a caller that passes `currentUrl` (even null) wants the
  // saved image shown inside the preview. The newly-picked File wins over the saved URL.
  const integrated = currentUrl !== undefined;
  const shownUrl = previewUrl ?? currentUrl ?? null;

  // The bare file input, reused across the (mutually exclusive) branches' clickable labels.
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="sr-only"
      aria-label={label}
      onChange={onFile}
    />
  );

  // Integrated cover remove: a freshly-picked File reverts (revert the staged pick, no
  // confirm); otherwise it's the saved cover, so defer to the caller (which confirms).
  const removeShownCover = () => {
    if (value) remove();
    else onRemoveExisting?.();
  };
  const canRemoveCover = Boolean(value) || Boolean(onRemoveExisting);

  // ── Integrated avatar: a clickable circle that shows the image with a "Cambiar"
  //    strip, or an "Agregar" prompt when empty. ──────────────────────────────────────
  const integratedAvatar = (
    <label className="group relative mt-1 block h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full bg-surface ring-1 ring-black/5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
      {shownUrl ? (
        <>
          {/* unoptimized: a freshly-picked file previews via a blob: URL the optimizer
              can't read; fine for this small panel preview. */}
          <Image src={shownUrl} alt="" fill unoptimized className="object-cover" />
          {/* "Cambiar" sits in a scrim at the foot of the circle so it stays legible over
              any photo and is visible without hover (tap targets the whole circle). */}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[11px] font-medium text-white">
            <PencilIcon className="h-3 w-3" />
            Cambiar
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-medium text-muted">
          <PlusIcon className="h-5 w-5" />
          Agregar
        </span>
      )}
      {fileInput}
    </label>
  );

  // ── Integrated cover: the saved/picked image in the 5:2 band with a trash corner and a
  //    "Cambiar imagen" / "Eliminar" footer, or an "Agregar" prompt in a dashed band. ──
  const integratedCover = shownUrl ? (
    <span className="mt-1 flex flex-col gap-3">
      <span className="relative block aspect-[5/2] w-full overflow-hidden rounded-xl bg-surface ring-1 ring-black/5">
        <Image src={shownUrl} alt="" fill unoptimized className="object-cover" />
        {canRemoveCover && (
          <button
            type="button"
            onClick={removeShownCover}
            aria-label={removeLabel}
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </span>
      <span className="flex items-center gap-3">
        <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
          Cambiar imagen
          {fileInput}
        </label>
        {canRemoveCover && (
          <button
            type="button"
            onClick={removeShownCover}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
          >
            {removeLabel}
          </button>
        )}
      </span>
    </span>
  ) : (
    <label className="mt-1 flex aspect-[5/2] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface text-sm font-medium text-muted transition-colors hover:border-brand-dark hover:text-brand-darker has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
      <PlusIcon className="h-6 w-6" />
      Agregar
      {fileInput}
    </label>
  );

  // The upload control on its own, so the cover variant can place it centered INSIDE the empty band
  // (no image yet) instead of below it. The other cases keep it in the controls row.
  const uploadButton = (
    <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
      {value ? "Cambiar imagen" : pickLabel}
      {fileInput}
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
      {integrated ? (
        // Integrated mode: the saved image (or freshly-picked file) shows inside the preview.
        variant === "avatar" ? (
          integratedAvatar
        ) : (
          integratedCover
        )
      ) : /* Avatar: circle and controls side by side. Cover: band on top, controls below — except when
            empty with hidePreviewWhenEmpty, which shows just the button (no band). */
      variant === "avatar" ? (
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
