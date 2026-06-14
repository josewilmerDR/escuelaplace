import type { ReactNode } from "react";

/**
 * The page-level layout primitive: the canvas + the centered content column. This is the
 * layer the design language was missing — every page used to hand-pick its own width and
 * padding, so columns drifted (max-w-4xl here, max-w-6xl there, py-6 vs py-10). Routing
 * pages through this fixes the catalog of widths in one place.
 *
 * Variants (see docs/design-language.md → "Layout de página"):
 *  - detail: a profile / detail page — gray canvas behind elevated cards, narrow reading
 *    column (max-w-4xl). Renders the `bg-surface` backdrop the FB-style pages need.
 *  - listing: grids and result pages — wide column (max-w-6xl) on the plain white body.
 *  - narrow: long-form text / single-column flows — max-w-3xl.
 *
 * The panel route group owns its own shell (app/(panel)/layout.tsx) and does NOT use this.
 */
export type PageVariant = "detail" | "listing" | "narrow";

const COLUMN: Record<PageVariant, string> = {
  detail: "mx-auto max-w-4xl px-4 py-6 sm:px-6",
  listing: "mx-auto max-w-6xl px-6 py-10",
  narrow: "mx-auto max-w-3xl px-6 py-12",
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
