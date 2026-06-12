import Image from "next/image";
import Link from "next/link";
import type { BusinessCardData } from "@/types";
import type { SupportTier } from "@/lib/firestore";

/**
 * Support badge copy + style per tier. `null` = not yet known (baseline SSR render before
 * the client re-rank resolves the buyer's community). Non-supporters are never hidden —
 * they show with an "invite them" badge (the ramp), which flips once they support.
 *
 * The badge is the ONLY place that talks about support. The school line below always
 * reads "Vinculado a {schoolName}": supported schools come from subscriptions, which may
 * target schools other than the linked one, so "Apoya a {schoolName}" would lie (e.g. a
 * business linked to school A whose community-tier support goes to school B).
 *
 * Exported so the profile badge (<SupportBadge>) uses the same copy/styles — card and
 * profile must never tell a different support story.
 */
export const TIER_BADGE: Record<SupportTier, { label: string; className: string }> = {
  community: {
    label: "Apoya a tu comunidad",
    className: "bg-brand-darker text-white",
  },
  general: {
    label: "Apoya a una escuela",
    className: "bg-brand-tint text-brand-darker",
  },
  none: {
    // Descriptive, NOT imperative: "invitalo" reads as a button, but there is no invite
    // flow behind it — don't afford an action that doesn't exist.
    label: "Aún no apoya a ninguna escuela",
    className: "border border-border text-muted",
  },
};

/** Grid is 1 / 2 / 3 columns (see RankedFeed) — lets next/image pick the right size. */
const COVER_SIZES = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

export function BusinessCard({
  business,
  tier = null,
}: {
  business: BusinessCardData;
  tier?: SupportTier | null;
}) {
  const badge = tier ? TIER_BADGE[tier] : null;
  const initial = business.name.charAt(0).toUpperCase();

  return (
    // Stretched-link card (not a wrapping <Link>): the title link's ::after covers the
    // card, keeping the whole surface clickable, while the school link below stays a
    // real nested target (relative z-10 lifts it above the overlay).
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-white transition-shadow hover:shadow-lg"
      style={{ viewTransitionName: `business-${business.id}` }}
    >
      {/* Cover (YouTube-thumbnail style): the photo sells the business, so it gets the
          top of the card. Fallback ladder keeps the grid scannable while most businesses
          haven't uploaded images: photo → logo centered on tint → big initial. */}
      <div className="relative aspect-video w-full overflow-hidden bg-brand-tint">
        {business.photo ? (
          <Image
            src={business.photo}
            alt=""
            fill
            sizes={COVER_SIZES}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : business.logoUrl ? (
          // A logo stretched to 16:9 looks broken — contain it on the tint instead.
          <Image
            src={business.logoUrl}
            alt=""
            fill
            sizes={COVER_SIZES}
            className="object-contain p-8"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-full items-center justify-center text-5xl font-bold text-brand-darker/40"
          >
            {initial}
          </span>
        )}

        {business.discount?.active && (
          // Overlaid like YouTube's duration chip. Dark scrim so it stays legible over
          // any photo. Capped + truncated: the text is merchant-controlled and
          // arbitrarily long.
          <span
            title={business.discount.text || undefined}
            className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-md bg-slate-900/75 px-2 py-1 text-xs font-semibold text-white"
          >
            {business.discount.text || "Descuento"}
          </span>
        )}
      </div>

      {/* Body: avatar + text column, YouTube's below-thumbnail row. */}
      <div className="flex flex-1 gap-3 p-4">
        {business.logoUrl ? (
          <Image
            src={business.logoUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-base font-bold text-brand-darker"
          >
            {initial}
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="line-clamp-2 font-semibold leading-snug text-slate-900 group-hover:text-brand-darker">
            <Link
              href={`/business/${business.slug}`}
              className="after:absolute after:inset-0"
            >
              {business.name}
            </Link>
          </h3>

          {(business.reviewStats.count > 0 ||
            business.categoryNames.length > 0) && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted">
              {business.reviewStats.count > 0 && (
                <span className="flex shrink-0 items-center gap-1 font-medium text-slate-700">
                  <span aria-hidden className="text-amber-500">
                    ★
                  </span>
                  <span className="sr-only">Calificación:</span>
                  {business.reviewStats.average.toFixed(1)}
                  <span className="font-normal text-muted">
                    ({business.reviewStats.count})
                  </span>
                </span>
              )}
              {business.categoryNames.length > 0 && (
                <span className="truncate">
                  {business.categoryNames.join(" · ")}
                </span>
              )}
            </p>
          )}

          {/* Linking a school is optional — unlinked businesses ("" id) skip the line. */}
          {business.schoolId && business.schoolName && (
            <p className="mt-1 text-sm text-slate-600">
              Vinculado a{" "}
              <Link
                href={`/school/${business.schoolId}`}
                className="relative z-10 font-medium hover:text-brand-darker hover:underline"
              >
                {business.schoolName}
              </Link>
            </p>
          )}

          {badge && (
            // mt-auto on the wrapper bottom-aligns the badge across cards in a grid row
            // even when titles wrap to different heights; pt-3 keeps a minimum gap when
            // the card has little content.
            <span className="mt-auto block pt-3">
              <span
                className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
