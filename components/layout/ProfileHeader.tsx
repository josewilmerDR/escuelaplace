import Image from "next/image";
import type { ReactNode } from "react";
import { VerifiedIcon } from "@/components/ui/icons";
import { PAGE_COVER_SIZES, PROFILE_COVER_ASPECT } from "@/lib/layout";

/**
 * The FB-style profile header shared by the public business and school pages: a wide cover
 * band, a circular avatar overlapping it, and the identity block (name + verified mark +
 * metadata). It was ~150 near-identical lines duplicated across both pages; extracting it
 * keeps the avatar overlap, the responsive center→left switch, and the view-transition
 * pairing identical on both.
 *
 * Presentational only: the page resolves which image to show (cover vs logo/photo fallback)
 * and passes a `cover` descriptor and `avatar`; this component does no data fetching and
 * decides no copy. Rows below the identity (action buttons, manage bar, section tabs, trust
 * chips, a donate CTA) are passed as `children` and render inside the header's padded body.
 */
export function ProfileHeader({
  cover,
  coverSizes = PAGE_COVER_SIZES,
  coverPriority = true,
  viewTransitionId,
  avatar,
  initial,
  name,
  verified = false,
  verifiedLabel,
  meta,
  coverOverlay,
  children,
}: {
  /**
   * Resolved cover image. `contain` renders a logo/photo fallback centered on the tint
   * (object-contain p-8) instead of a full-bleed cover. Omit for the initial-only fallback.
   */
  cover?: { src: string; contain?: boolean };
  /** next/image `sizes` for the cover. Defaults to the page-width cover. */
  coverSizes?: string;
  /** Cover is above the fold on these pages — defaults to priority. */
  coverPriority?: boolean;
  /** Pairs the cover with the card that linked here via a view transition (business). */
  viewTransitionId?: string;
  /** Avatar image. Omit to render the initial in a brand-tint circle. */
  avatar?: string;
  /** Uppercase first letter, the fallback for both cover and avatar. */
  initial: string;
  /** Page title (the page name). Rendered as `<h1>`. */
  name: ReactNode;
  /** Whether to show the verified mark. */
  verified?: boolean;
  /** Accessible/tooltip label for the verified mark (Spanish copy). */
  verifiedLabel?: string;
  /** Lines under the name (rating, categories, locality…); each brings its own `mt-1`. */
  meta?: ReactNode;
  /**
   * Controls floated on top of the cover band (the cover div is `relative`, so the overlay
   * positions itself with `absolute`). Used by the school's manage controls — bell + gear
   * pinned to the cover corners. Renders nothing for visitors.
   */
  coverOverlay?: ReactNode;
  /** Rows below the identity row: actions, manage bar, tabs, CTA, trust chips. */
  children?: ReactNode;
}) {
  return (
    // Depth, not a hard border: a soft hairline ring + small shadow reads as an elevated
    // surface floating on the gray canvas.
    <header className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Cover: wider than 16:9 on desktop — FB covers are short bands. Fallback ladder
          (resolved by the page): photo → logo/photo contained on tint → big initial. */}
      <div
        className={`relative w-full bg-gradient-to-br from-brand-tint to-white ${PROFILE_COVER_ASPECT}`}
        style={
          viewTransitionId ? { viewTransitionName: viewTransitionId } : undefined
        }
      >
        {cover ? (
          <Image
            src={cover.src}
            alt=""
            fill
            priority={coverPriority}
            sizes={coverSizes}
            className={cover.contain ? "object-contain p-8" : "object-cover"}
          />
        ) : (
          <span
            aria-hidden
            className="flex h-full items-center justify-center text-7xl font-bold text-brand-darker/50"
          >
            {initial}
          </span>
        )}
        {coverOverlay}
      </div>

      <div className="px-5 pb-4 sm:px-8">
        {/* Centered avatar-over-cover on mobile, avatar-left row on desktop. */}
        <div className="flex flex-col items-center sm:flex-row sm:items-end sm:gap-5">
          {/* relative z-10: the cover's fill image is absolutely positioned and would
              otherwise paint over the avatar's overlapping half. */}
          <div className="relative z-10 -mt-14 shrink-0 sm:-mt-16">
            {avatar ? (
              // The white ring lifts the avatar off the cover (the FB overlap).
              <Image
                src={avatar}
                alt=""
                width={128}
                height={128}
                className="h-28 w-28 rounded-full bg-white object-cover ring-4 ring-white sm:h-32 sm:w-32"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-tint text-4xl font-bold text-brand-darker ring-4 ring-white sm:h-32 sm:w-32"
              >
                {initial}
              </span>
            )}
          </div>

          <div className="mt-3 min-w-0 text-center sm:mt-0 sm:flex-1 sm:pb-1 sm:text-left">
            <h1 className="flex flex-wrap items-center justify-center gap-2 text-3xl font-semibold tracking-tight text-foreground sm:justify-start">
              {name}
              {verified && (
                <>
                  <VerifiedIcon
                    className="h-6 w-6 shrink-0 text-brand"
                    title={verifiedLabel}
                  />
                  <span className="sr-only">{verifiedLabel}</span>
                </>
              )}
            </h1>
            {meta}
          </div>
        </div>

        {children}
      </div>
    </header>
  );
}
