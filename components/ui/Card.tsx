import type { ReactNode } from "react";

/**
 * The single calm-depth surface primitive (see docs/design-language.md → "Depth, not
 * borders"). Every elevated block — profile sections, list items, sub-group panels —
 * renders through this (or through `cardClass`, below) so the geometry (radius, padding)
 * and the elevation (hairline ring + soft shadow, never a hard 1px border) are identical
 * everywhere instead of hand-copied class strings that drift between pages.
 *
 * Variants:
 *  - elevated (default): white surface floating on the gray canvas.
 *  - inset: a recessed slate panel for a sub-group inside another surface.
 *  - selected: the active/chosen state — swap the hairline ring for a brand ring.
 */
export type CardVariant = "elevated" | "inset" | "selected";

const VARIANTS: Record<CardVariant, string> = {
  elevated: "bg-white shadow-sm ring-1 ring-black/5",
  inset: "bg-surface ring-1 ring-black/5",
  selected: "bg-white shadow-md ring-2 ring-brand",
};

/**
 * The card class string, for callers that need the surface on an element Card does not
 * render (e.g. `Section` puts it on its own `<section>`, a clickable card on an `<article>`
 * with a stretched link). `padded` adds the standard `p-5 sm:p-6`; pass false for cards
 * with edge-to-edge media that pad their own body.
 */
export function cardClass(variant: CardVariant = "elevated", padded = true): string {
  return `rounded-2xl ${padded ? "p-5 sm:p-6 " : ""}${VARIANTS[variant]}`;
}

export function Card({
  variant = "elevated",
  padded = true,
  className = "",
  children,
}: {
  variant?: CardVariant;
  /** Standard `p-5 sm:p-6` padding. Set false for cards that pad their own body. */
  padded?: boolean;
  /** Extra classes for one-off layout needs (margins, overflow) — not for colors. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${cardClass(variant, padded)} ${className}`.trim()}>
      {children}
    </div>
  );
}
