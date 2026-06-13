"use client";

/**
 * Gallery manager for the page edit forms (business and school). Owners add up to
 * BUSINESS_GALLERY_MAX photos (shown in the public "Fotos" section) and remove them
 * individually. The actual persistence is injected (addPhoto/removePhoto), so the same
 * UI manages either page type.
 *
 * Unlike the create-form pickers (which hold files until submit), this mutates
 * immediately: each add uploads to Storage and appends to `photos`, each remove
 * updates the doc right away — there is no enclosing "save" to defer to.
 */
import Image from "next/image";
import { useRef, useState } from "react";
import { validateImageFile } from "@/components/ui/ImagePicker";
import { userErrorMessage } from "@/lib/errors";
import { BUSINESS_GALLERY_MAX } from "@/types";

export function GalleryManager({
  initialPhotos,
  addPhoto,
  removePhoto,
}: {
  /** Current gallery URLs (already excluding any legacy cover at photos[0]). */
  initialPhotos: string[];
  /** Upload the file, persist it on the page doc, and return the stored URL. */
  addPhoto: (file: File) => Promise<string>;
  /** Remove the URL from the page doc (and best-effort delete the file). */
  removePhoto: (url: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Clear the native input so re-picking the same file still fires onChange.
    e.target.value = "";
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const url = await addPhoto(file);
      setPhotos((prev) => [...prev, url]);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo subir la foto."));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (url: string) => {
    setError(null);
    setBusy(true);
    try {
      await removePhoto(url);
      setPhotos((prev) => prev.filter((p) => p !== url));
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo quitar la foto."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Hasta {BUSINESS_GALLERY_MAX} fotos para la sección “Fotos” de tu página
        pública: productos, el local, tu trabajo. Se publican al instante.
      </p>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((url) => (
            <li key={url} className="flex flex-col gap-1">
              <span className="relative block aspect-square overflow-hidden rounded-lg border border-border bg-surface">
                <Image
                  src={url}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 120px, 33vw"
                  className="object-cover"
                />
              </span>
              <button
                type="button"
                onClick={() => onRemove(url)}
                disabled={busy}
                className="text-xs text-muted underline hover:text-red-600 disabled:opacity-50"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {photos.length < BUSINESS_GALLERY_MAX ? (
        <label
          className={`btn btn-outline w-fit has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
            busy ? "pointer-events-none opacity-50" : "cursor-pointer"
          }`}
        >
          {busy ? "Subiendo…" : `Agregar foto (${photos.length}/${BUSINESS_GALLERY_MAX})`}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Agregar foto a la galería"
            disabled={busy}
            onChange={onFile}
          />
        </label>
      ) : (
        <p className="text-xs text-muted">
          Alcanzaste el máximo de {BUSINESS_GALLERY_MAX} fotos — quitá una para
          subir otra.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
