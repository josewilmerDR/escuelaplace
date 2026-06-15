import type { ReactNode } from "react";
import { PROFILE_COVER_ASPECT } from "@/lib/layout";

/**
 * Loading placeholder that mirrors `ProfileHeader`'s geometry exactly so the two domain
 * skeletons (business, school) stop drifting from the real header. It copies the bits that
 * MUST agree for a jump-free loading→loaded swap: the surface (radius + ring + shadow), the
 * cover band's aspect AND its `from-brand-tint to-white` gradient (a flat tint would visibly
 * change when the real header paints), the avatar's overlap offsets/size/ring, and the body
 * padding (`px-5 pb-4 sm:px-8`). Whenever ProfileHeader's geometry changes, change it here too.
 *
 * Decorative/presentational only: it renders just the visual placeholders. The page-level
 * `loading.tsx` owns the `role="status"`/`sr-only` live region and marks this region
 * `aria-hidden`. Each domain passes its own rows (actions, badges, tabs) as `children`,
 * rendered inside the padded body just like the real header.
 *
 * `metaLines` controls how many meta-line placeholders render under the title (default 2):
 * the business header can show two lines (rating / "Vinculado a" + categories), but the
 * school header shows only one (locality, often none), so school passes `metaLines={1}` to
 * avoid over-reserving vertical space the real header never fills.
 */
export function ProfileHeaderSkeleton({
  children,
  metaLines = 2,
}: {
  children?: ReactNode;
  metaLines?: 1 | 2;
}) {
  return (
    // Same surface as ProfileHeader's <header>: depth via ring + shadow, never a hard border.
    <header className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Cover band: mirror the real header's aspect AND gradient so the swap doesn't flash a
          different fill. */}
      <div
        className={`w-full animate-pulse bg-gradient-to-br from-brand-tint to-white ${PROFILE_COVER_ASPECT}`}
      />

      {/* pb-4 (not pb-5): match ProfileHeader so the section cards below line up identically. */}
      <div className="px-5 pb-4 sm:px-8">
        {/* Centered avatar-over-cover on mobile, avatar-left row on desktop — same switch. */}
        <div className="flex flex-col items-center sm:flex-row sm:items-end sm:gap-5">
          {/* Avatar circle: same offsets/size/ring as ProfileHeader's fallback. */}
          <div className="relative z-10 -mt-14 h-28 w-28 shrink-0 animate-pulse rounded-full bg-brand-tint ring-4 ring-white sm:-mt-16 sm:h-32 sm:w-32" />

          <div className="mt-3 w-full min-w-0 text-center sm:mt-0 sm:flex-1 sm:pb-1 sm:text-left">
            {/* Title placeholder. */}
            <div className="mx-auto h-8 w-2/3 animate-pulse rounded bg-brand-tint sm:mx-0" />
            {/* Meta lines: the real header shows up to two (rating / "Vinculado a" +
                categories). `metaLines` placeholders keep the swap jump-free; school passes
                1 because its header only ever shows the locality line. */}
            <div className="mx-auto mt-2 h-4 w-1/3 animate-pulse rounded bg-surface ring-1 ring-black/5 sm:mx-0" />
            {metaLines === 2 && (
              <div className="mx-auto mt-2 h-4 w-1/4 animate-pulse rounded bg-surface ring-1 ring-black/5 sm:mx-0" />
            )}
          </div>
        </div>

        {children}
      </div>
    </header>
  );
}
