import type { DonorTier } from "@/types";

/**
 * Recognition tier chip for personal donors. The tier deliberately blurs the amount
 * (it maps to a range of confirmed units, never an exact figure) — render it instead of
 * units or colones on any public surface.
 */
const TIERS: Record<DonorTier, { label: string; className: string }> = {
  bronze: { label: "Bronce", className: "bg-amber-100 text-amber-900" },
  silver: { label: "Plata", className: "bg-slate-200 text-slate-700" },
  gold: { label: "Oro", className: "bg-yellow-100 text-yellow-800" },
  platinum: { label: "Platino", className: "bg-violet-100 text-violet-800" },
};

export function DonorTierBadge({ tier }: { tier: DonorTier }) {
  const t = TIERS[tier];
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.className}`}
    >
      {t.label}
    </span>
  );
}
