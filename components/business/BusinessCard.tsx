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
 */
const TIER_BADGE: Record<SupportTier, { label: string; className: string }> = {
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

export function BusinessCard({
  business,
  tier = null,
}: {
  business: BusinessCardData;
  tier?: SupportTier | null;
}) {
  const badge = tier ? TIER_BADGE[tier] : null;

  return (
    // Stretched-link card (not a wrapping <Link>): the title link's ::after covers the
    // card, keeping the whole surface clickable, while the school link below stays a
    // real nested target (relative z-10 lifts it above the overlay).
    <article
      className="group relative flex flex-col rounded-2xl border border-border bg-surface p-5 transition-shadow hover:shadow-md"
      style={{ viewTransitionName: `business-${business.id}` }}
    >
      <div className="flex items-start gap-3">
        {/* Logo (or first photo) with an initial-on-brand fallback, so the grid scans
            visually even while most businesses haven't uploaded images yet. */}
        {business.logoUrl || business.photo ? (
          <Image
            src={(business.logoUrl ?? business.photo)!}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-lg font-bold text-brand-darker"
          >
            {business.name.charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-slate-900 group-hover:text-brand-darker">
              <Link
                href={`/business/${business.slug}`}
                className="after:absolute after:inset-0"
              >
                {business.name}
              </Link>
            </h3>
            {business.discount?.active && (
              // Capped + truncated: the text is merchant-controlled and arbitrarily
              // long — it must never squeeze the business name (the primary info)
              // out of the row.
              <span
                title={business.discount.text || undefined}
                className="max-w-[45%] shrink-0 truncate rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-darker"
              >
                {business.discount.text || "Descuento"}
              </span>
            )}
          </div>

          {business.categoryNames.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              {business.categoryNames.join(" · ")}
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        Vinculado a{" "}
        <Link
          href={`/school/${business.schoolId}`}
          className="relative z-10 font-medium hover:text-brand-darker hover:underline"
        >
          {business.schoolName}
        </Link>
      </p>

      {badge && (
        <span
          className={`mt-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
    </article>
  );
}
