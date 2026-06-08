import Link from "next/link";
import type { BusinessCardData } from "@/types";
import type { SupportTier } from "@/lib/firestore";

/**
 * Support badge copy + style per tier. `null` = not yet known (baseline SSR render before
 * the client re-rank resolves the buyer's community). Non-supporters are never hidden —
 * they show with an "invite them" badge (the ramp), which flips once they support.
 */
const TIER_BADGE: Record<SupportTier, { label: string; className: string }> = {
  community: {
    label: "Apoya a tu comunidad",
    className: "bg-brand text-white",
  },
  general: {
    label: "Apoya a una escuela",
    className: "bg-brand-tint text-brand-darker",
  },
  none: {
    label: "Aún no apoya — invitalo",
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
    <Link
      href={`/business/${business.slug}`}
      className="group flex flex-col rounded-2xl border border-border bg-surface p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900 group-hover:text-brand-dark">
          {business.name}
        </h3>
        {business.discount?.active && (
          <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-darker">
            {business.discount.text || "Descuento"}
          </span>
        )}
      </div>

      {business.categoryNames.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          {business.categoryNames.join(" · ")}
        </p>
      )}

      <p className="mt-3 text-sm text-slate-600">
        {tier && tier !== "none" ? "Apoya a " : "Vinculado a "}
        <span className="font-medium">{business.schoolName}</span>
      </p>

      {badge && (
        <span
          className={`mt-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
    </Link>
  );
}
