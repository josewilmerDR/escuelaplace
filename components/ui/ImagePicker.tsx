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
}: {
  label: string;
  hint?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  variant: "avatar" | "cover";
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
          <span className="flex h-full items-center justify-center text-xs text-muted">
            Sin imagen
          </span>
        )}
      </span>
    );

  const controls = (
    <span className="flex items-center gap-3">
      <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
        {value ? "Cambiar imagen" : "Subir imagen"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={label}
          onChange={onFile}
        />
      </label>
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
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {/* Avatar: circle and controls side by side. Cover: band on top, controls below. */}
      {variant === "avatar" ? (
        <span className="mt-1 flex items-center gap-4">
          {preview}
          {controls}
        </span>
      ) : (
        <span className="mt-1 flex flex-col gap-3">
          {preview}
          {controls}
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
