"use client";

/**
 * Compact media preview for a single-product "Productos" tool, overlaid on the tool cover's
 * top-right corner: up to three stacked, fanned cards (the product's first photo on top, blanks
 * peeking behind), a count badge and a play badge when a video exists. Clicking opens a
 * full-screen lightbox that cycles through every photo and the optional video (Escape closes,
 * arrows move) — the same overlay pattern as the business PhotoGallery, extended to mix in a
 * <video> item. PURELY a viewer; it never touches the buy flow.
 */
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlayIcon } from "@/components/ui/icons";
import { safeMediaUrl } from "@/lib/url";

type MediaItem = { type: "photo" | "video"; src: string };

export function ProductCoverMedia({
  photos,
  videoUrl,
  name,
  buyHref,
}: {
  photos: string[];
  /** Optional single short video, appended after the photos. */
  videoUrl?: string;
  /** Product name, for the accessible labels. */
  name: string;
  /** When set (verified school), a "Comprar" button anchors to the open media's bottom-right. */
  buyHref?: string;
}) {
  // Host-gate the video before it loads into a <video> (which bypasses next/image): an
  // off-domain/forged URL is dropped, so it drives neither the media list nor the play badge.
  const safeVideo = safeMediaUrl(videoUrl);
  const media: MediaItem[] = [
    ...photos.map((src) => ({ type: "photo" as const, src })),
    ...(safeVideo ? [{ type: "video" as const, src: safeVideo }] : []),
  ];

  // Index of the media open in the lightbox; null = closed. The lightbox is portaled to <body> so
  // it escapes the cover's stacking context (otherwise the sticky header and the cover's own
  // "Comprar" button paint over it); it only ever opens on a click, so the DOM is always present.
  const [index, setIndex] = useState<number | null>(null);
  const open = index !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Tab") {
        // Trap Tab within the overlay so focus can't reach the page behind the modal.
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open, close, step]);

  if (media.length === 0) return null;

  const cover = photos[0] ?? null; // front-card image (video-only product → play tile)
  const hasVideo = Boolean(safeVideo);
  const current = index !== null ? media[index] : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIndex(0)}
        aria-label={`Ver fotos y video de ${name}`}
        className="group relative block h-16 w-16 sm:h-20 sm:w-20"
      >
        {/* Fanned cards peeking behind the front one (decorative). */}
        <span
          aria-hidden
          className="absolute inset-0 rotate-[8deg] rounded-xl bg-white/70 shadow-sm ring-1 ring-black/10"
        />
        <span
          aria-hidden
          className="absolute inset-0 rotate-[4deg] rounded-xl bg-white/85 shadow-sm ring-1 ring-black/10"
        />
        {/* Front card = first photo (or a play tile when the product is video-only). */}
        <span className="relative block h-full w-full overflow-hidden rounded-xl bg-surface shadow-md ring-1 ring-black/10">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="80px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-black text-white">
              <PlayIcon className="h-6 w-6" />
            </span>
          )}
          {hasVideo && cover && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
                <PlayIcon className="h-4 w-4" />
              </span>
            </span>
          )}
        </span>
        {media.length > 1 && (
          <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white">
            {media.length}
          </span>
        )}
      </button>

      {open &&
        current &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Medios de ${name}`}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-12"
            onClick={close}
          >
            {/* Uniform stage: every item — photo or video — is laid out object-contain inside the
                same fixed box, so they all read at one size regardless of aspect ratio. */}
            <div
              className="relative h-[70vh] w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {current.type === "photo" ? (
                <Image
                  key={index}
                  src={current.src}
                  alt={`Foto de ${name}`}
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

              {/* "Comprar" anchored to the open media's bottom-right (verified schools only). */}
              {buyHref && (
                <Link
                  href={buyHref}
                  onClick={(e) => e.stopPropagation()}
                  className="btn btn-primary absolute bottom-3 right-3 shadow-lg"
                >
                  Comprar
                </Link>
              )}
            </div>

            {/* Sits above the stage and pinned to the viewport corner, so it's always reachable. */}
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70"
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
                  className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70"
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
                  className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70"
                >
                  ›
                </button>
                <p
                  aria-live="polite"
                  className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white"
                >
                  {index + 1} / {media.length}
                </p>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
