/**
 * Shared `sizes` and aspect ratios for catalog images, kept in one place so the same
 * picture renders at the same intrinsic size everywhere it appears (a profile cover and
 * the card it links from must not disagree about how wide they are).
 */

/**
 * Page-width cover (profile headers). The content column is max-w-4xl (896px) minus
 * padding, so on wide viewports the image renders at ~848px.
 */
export const PAGE_COVER_SIZES = "(min-width: 896px) 848px, 100vw";

/**
 * Card cover (the 1 / 2 / 3-column grids — see RankedFeed). One column of a max-w-6xl
 * grid is ~33vw on desktop, half on tablet, full on phone.
 */
export const CARD_COVER_SIZES =
  "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

/**
 * Cover for the single-column activity feed (the school "Principal" tab, where tools and
 * projects stack as full-width post cards). The card caps at the feed column (max-w-2xl =
 * 672px) on desktop and is ~full-width below that — wider than a grid cell, so its cover
 * needs its own hint to avoid being upscaled.
 */
export const FEED_COVER_SIZES = "(min-width: 720px) 672px, 100vw";

/**
 * Cover aspect ratios. Profile headers use a short FB-style band on desktop; cards keep
 * the YouTube-thumbnail 16:9. Tailwind arbitrary-value classes so they read as utilities
 * at the call site.
 */
export const PROFILE_COVER_ASPECT = "aspect-video sm:aspect-[5/2]";
export const CARD_COVER_ASPECT = "aspect-video";
