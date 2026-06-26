"use client";

/**
 * A candidate's avatar on the public reinado page, upgraded to open a full-screen media carousel.
 *
 * The card stays compact: the round 80×80 avatar shows the candidate's cover (the first image of the
 * carousel, via `candidateCoverUrl`), exactly as before. When the candidate has MORE than that one
 * image — additional photos and/or a short video — the avatar becomes a button with a small badge
 * (a ▶ when there's a video, otherwise the item count) and tapping it opens a lightbox carousel with
 * every photo + the video. A candidate with a single image (or a legacy single `photoUrl`) renders a
 * plain, non-interactive avatar, identical to the previous behavior.
 *
 * The lightbox mirrors PhotoGallery's modal (Escape closes, ←/→ navigate, focus-trap on the
 * controls, body scroll-lock, focus returns to the trigger), with one difference: a slide is either
 * an image (object-contain) or a `<video controls>`. The `key={index}` per slide forces a fresh
 * element so the previous photo/video never lingers — and a navigated-away video stops playing.
 * PURELY INFORMATIONAL — the platform never processes money.
 */
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayIcon, UserIcon } from "@/components/ui/icons";
import { candidateCoverUrl } from "@/lib/firestore";
import type { CandidateMediaItem } from "@/types";

export function CandidateMediaAvatar({
  media,
  name,
}: {
  media: CandidateMediaItem[];
  name: string;
}) {
  // Index of the open slide; null = closed.
  const [index, setIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = index !== null;

  const cover = candidateCoverUrl({ media });
  const hasVideo = media.some((m) => m.type === "video");
  // A carousel is worth opening only when there's more than the single cover image.
  const hasCarousel = media.length > 1 || hasVideo;

  const close = useCallback(() => setIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setIndex((i) => (i === null ? i : (i + delta + media.length) % media.length)),
    [media.length],
  );

  useEffect(() => {
    if (!open) return;
    // Remember the trigger so focus returns to it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Tab") {
        // Trap Tab within the overlay controls so focus can't reach the page behind the modal.
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button");
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
      // Return focus to the trigger instead of dropping it to <body> (WCAG 2.4.3).
      previouslyFocused?.focus();
    };
  }, [open, close, step]);

  const avatarInner = cover ? (
    <Image src={cover} alt="" fill sizes="80px" className="object-cover" />
  ) : (
    <span className="flex h-full items-center justify-center text-brand-darker">
      <UserIcon className="h-8 w-8" />
    </span>
  );

  const avatarClass =
    "relative block h-20 w-20 shrink-0 overflow-hidden rounded-full bg-brand-tint ring-1 ring-black/5";

  // Single image (or legacy photo) → the plain avatar, unchanged.
  if (!hasCarousel) {
    return <span className={avatarClass}>{avatarInner}</span>;
  }

  const current = index !== null ? media[index] : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIndex(0)}
        aria-label={
          hasVideo
            ? `Ver fotos y video de ${name}`
            : `Ver fotos de ${name}`
        }
        className={`${avatarClass} group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
      >
        {avatarInner}
        {/* Badge: a ▶ when there's a video, otherwise the number of items. */}
        <span className="absolute bottom-0 right-0 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-surface">
          {hasVideo ? <PlayIcon className="h-3 w-3" /> : media.length}
        </span>
      </button>

      {open && current && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos y video de ${name}`}
          className="fixed inset-0 z-50 bg-black/90"
          onClick={close}
        >
          {/* The media area. Clicking it (or the controls) never closes; the margins around it do. */}
          <div
            className="absolute inset-0 m-4 flex items-center justify-center sm:m-12"
            onClick={(e) => e.stopPropagation()}
          >
            {current.type === "image" ? (
              <Image
                // key forces a fresh element per slide so the previous one doesn't linger.
                key={index}
                src={current.url}
                alt={`Foto ${index + 1} de ${media.length} de ${name}`}
                fill
                sizes="100vw"
                className="object-contain"
              />
            ) : (
              <video
                key={index}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg bg-black"
              >
                <source src={current.url} />
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
