import type { ReactNode } from "react";

/**
 * The page-level layout primitive: the canvas + the centered content column. This is the
 * layer the design language was missing — every page used to hand-pick its own width and
 * padding, so columns drifted (max-w-4xl here, max-w-6xl there, py-6 vs py-10). Routing
 * pages through this fixes the catalog of widths in one place.
 *
 * Every variant now shares ONE width — `max-w-6xl`, the home column — so content edges line
 * up across the whole app. The variants differ only in backdrop and vertical rhythm
 * (see docs/design-language.md → "Layout — page widths"):
 *  - detail: a profile / detail page — renders the `bg-surface` gray backdrop the FB-style
 *    pages need behind their elevated cards.
 *  - listing: grids and result pages on the plain white body.
 *  - narrow: long-form text / single-column flows — same width, just more vertical breathing
 *    room (py-12).
 *
 * The panel route group owns its own shell (app/(panel)/layout.tsx) and does NOT use this.
 */
export type PageVariant = "detail" | "listing" | "narrow";

// Mobile-first gutters: px-4 on phones (matching the detail variant and the panel shell) so
// every page lines up and the narrowest phones don't lose ~16px of content width to the
// gutter, widening to px-6 from sm up.
const COLUMN: Record<PageVariant, string> = {
  detail: "mx-auto max-w-6xl px-4 py-6 sm:px-6",
  listing: "mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10",
  narrow: "mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12",
};

export function PageContainer({
  variant = "listing",
  className = "",
  children,
}: {
  variant?: PageVariant;
  /** Extra layout classes on the content column for one-off needs — not for colors. */
  className?: string;
  children: ReactNode;
}) {
  const main = (
    <main className={`${COLUMN[variant]} ${className}`.trim()}>{children}</main>
  );
  // The detail variant floats white cards on a gray canvas — the FB-page backdrop.
  if (variant === "detail") {
    return <div className="min-h-screen bg-surface">{main}</div>;
  }
  return main;
}
