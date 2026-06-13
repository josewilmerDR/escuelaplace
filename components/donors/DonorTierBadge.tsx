import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { DonorTier } from "@/types";

/**
 * Recognition tier chip for personal donors. The tier deliberately blurs the amount
 * (it maps to a range of confirmed units, never an exact figure) — render it instead of
 * units or colones on any public surface.
 */
const TIERS: Record<DonorTier, { tone: BadgeTone; label: string }> = {
  bronze: { tone: "bronze", label: "Bronce" },
  silver: { tone: "silver", label: "Plata" },
  gold: { tone: "gold", label: "Oro" },
  platinum: { tone: "platinum", label: "Platino" },
};

export function DonorTierBadge({ tier }: { tier: DonorTier }) {
  const { tone, label } = TIERS[tier];
  return <Badge tone={tone}>{label}</Badge>;
}
