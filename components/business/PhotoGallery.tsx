"use client";

/**
 * Gallery grid + lightbox for the public business profile. The grid crops every photo
 * to a square, so without this the full image (a menu, a price list, a workshop shot)
 * would be unrecoverable — clicking a thumbnail opens the uncropped photo in a
 * full-screen overlay with keyboard navigation (Escape closes, arrows move).
 */
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export function PhotoGallery({
  photos,
  businessName,
}: {
  photos: string[];
  businessName: string;
}) {
  // Index of the photo open in the lightbox; null = closed.
  const [index, setIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = index !== null;

  const close = useCallback(() => setIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setIndex((i) =>
        i === null ? i : (i + delta + photos.length) % photos.length,
      ),
    [photos.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    // Lock the page scroll behind the overlay and land focus on the close button so
    // keyboard users aren't left tabbing through the page underneath.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, step]);

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Ver foto ${i + 1} de ${photos.length} en grande`}
            className="group relative aspect-square overflow-hidden rounded-xl bg-brand-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Image
              src={src}
              alt={`Foto de ${businessName}`}
              fill
              sizes="(min-width: 640px) 240px, 50vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${businessName}`}
          className="fixed inset-0 z-50 bg-black/90"
          // Backdrop click closes; the controls stop propagation themselves.
          onClick={close}
        >
          <div
            className="absolute inset-0 m-4 sm:m-12"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              // key forces a fresh element per photo so the previous image doesn't
              // linger while the next one loads.
              key={index}
              src={photos[index]}
              alt={`Foto ${index + 1} de ${photos.length} de ${businessName}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70"
          >
            ×
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Foto anterior"
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Foto siguiente"
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70"
              >
                ›
              </button>
              <p
                aria-live="polite"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white"
              >
                {index + 1} / {photos.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
