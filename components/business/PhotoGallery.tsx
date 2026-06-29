"use client";

/**
 * Gallery grid + lightbox for the public business profile. The grid crops every photo
 * to a square, so without this the full image (a menu, a price list, a workshop shot)
 * would be unrecoverable — clicking a thumbnail opens the uncropped photo in a
 * full-screen overlay with keyboard navigation (Escape closes, arrows move).
 *
 * An optional `videoUrl` is appended after the photos as one more media item (a play tile
 * thumbnail, a <video> in the lightbox), so the project stages can show their short clip
 * inside the same carousel instead of a separate player below.
 */
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardCarousel } from "@/components/ui/Carousel";
import { PlayIcon } from "@/components/ui/icons";
import { safeMediaUrl } from "@/lib/url";

type MediaItem = { type: "photo" | "video"; src: string };

export function PhotoGallery({
  photos,
  businessName,
  videoUrl,
  variant = "grid",
}: {
  photos: string[];
  businessName: string;
  /** Optional single short video, appended after the photos as the last media item. */
  videoUrl?: string;
  /** "grid" (default): a 2/3-column square grid (business profile). "carousel": a horizontal
   *  snap track — 1 item visible on mobile, 3 on desktop — for the project stages, where the
   *  media sits inside an already-narrow inset card and a grid would stack tall on mobile. The
   *  lightbox is identical in both. */
  variant?: "grid" | "carousel";
}) {
  // Photos first, then the optional video — the single ordered list both the track and the
  // lightbox iterate over, so a video index lines up across thumbnail and overlay. The video src
  // is host-gated (safeMediaUrl) since it loads into a <video> that bypasses next/image; an
  // off-domain/forged URL is dropped so it never becomes a media item.
  const safeVideo = safeMediaUrl(videoUrl);
  const media: MediaItem[] = [
    ...photos.map((src) => ({ type: "photo" as const, src })),
    ...(safeVideo ? [{ type: "video" as const, src: safeVideo }] : []),
  ];

  // Index of the media open in the lightbox; null = closed.
  const [index, setIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = index !== null;

  const close = useCallback(() => setIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setIndex((i) =>
        i === null ? i : (i + delta + media.length) % media.length,
      ),
    [media.length],
  );

  useEffect(() => {
    if (!open) return;
    // Remember the thumbnail that opened the lightbox so focus returns to it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Tab") {
        // Trap Tab within the overlay (close / prev / next) so focus can't reach the page
        // behind the modal — matches ConfirmDialog and honors aria-modal.
        const focusable =
          dialogRef.current?.querySelectorAll<HTMLElement>("button");
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
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
      // Return focus to the trigger thumbnail instead of dropping it to <body> (WCAG 2.4.3).
      previouslyFocused?.focus();
    };
  }, [open, close, step]);

  if (media.length === 0) return null;

  // One thumbnail button (opens the lightbox at its index) — shared by both layouts. The grid
  // crops to a square; the carousel uses a 4/3 slide so a near-full-width mobile item isn't a
  // huge square. A video thumbnail shows its first frame (preload="metadata") under a play badge.
  const thumbnail = (item: MediaItem, i: number) => (
    <button
      key={i}
      type="button"
      onClick={() => setIndex(i)}
      aria-label={
        item.type === "video"
          ? `Reproducir video de ${businessName}`
          : `Ver foto ${i + 1} de ${media.length} en grande`
      }
      className={`group relative w-full overflow-hidden rounded-xl bg-brand-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        variant === "carousel" ? "aspect-[4/3]" : "aspect-square"
      }`}
    >
      {item.type === "photo" ? (
        <Image
          src={item.src}
          alt={`Foto de ${businessName}`}
          fill
          sizes="(min-width: 640px) 240px, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <>
          {/* Muted, controls-less frame preview; pointer-events-none so the wrapping button
              (not the <video>) takes the click and opens the lightbox. */}
          <video
            src={item.src}
            preload="metadata"
            muted
            playsInline
            className="pointer-events-none h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/15">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white transition-transform duration-300 group-hover:scale-110">
              <PlayIcon className="h-5 w-5" />
            </span>
          </span>
        </>
      )}
    </button>
  );

  const current = index !== null ? media[index] : null;

  return (
    <>
      {variant === "carousel" ? (
        <CardCarousel
          items={media}
          getKey={(_, i) => String(i)}
          ariaLabel={`Fotos y video de ${businessName}`}
          renderItem={thumbnail}
        />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map(thumbnail)}
        </div>
      )}

      {open && current && (
        <div
          ref={dialogRef}
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
            {current.type === "photo" ? (
              <Image
                // key forces a fresh element per item so the previous one doesn't
                // linger while the next one loads.
                key={index}
                src={current.src}
                alt={`Foto ${index + 1} de ${media.length} de ${businessName}`}
                fill
                sizes="100vw"
                className="object-contain"
              />
            ) : (
              <video
                key={index}
                controls
                autoPlay
                preload="metadata"
                className="h-full w-full bg-black object-contain"
              >
                <source src={current.src} />
                Tu navegador no puede reproducir este video.
              </video>
            )}
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

          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Anterior"
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
                aria-label="Siguiente"
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70"
              >
                ›
              </button>
              <p
                aria-live="polite"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white"
              >
                {index + 1} / {media.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
