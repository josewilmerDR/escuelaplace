import type { ReactNode } from "react";

/**
 * The "app-icon" tile: a rounded square in a soft brand wash with an inset ring, leading
 * cards and benefit rows across the app. The recipe (from docs/design-language.md →
 * "Icon tile") was hand-copied in four places and had already started to drift (the
 * /create copy was missing `shrink-0`); this dedupes it into one server-safe primitive.
 *
 * Sizes mirror the doc's two variants: "md" (h-12 tile / h-6 icon) is the default, "sm"
 * (h-9 tile / h-5 icon) the compact one. Pass the (already aria-hidden) icon as children;
 * the tile span is also marked aria-hidden since it is purely decorative.
 */
export function IconTile({
  size = "md",
  className = "",
  children,
}: {
  size?: "md" | "sm";
  /** Extra layout classes for one-off needs — not for colors. */
  className?: string;
  children: ReactNode;
}) {
  const box = size === "md" ? "h-12 w-12" : "h-9 w-9";
  return (
    <span
      aria-hidden
      className={`grid ${box} shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-brand-darker ring-1 ring-inset ring-brand-dark/10 ${className}`.trim()}
    >
      {children}
    </span>
  );
}
