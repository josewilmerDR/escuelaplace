import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The single "nothing here yet" primitive. Every arid empty state — home with no
 * businesses, search with no results, the panel with no pages, the admin queue when
 * empty — renders through this so the treatment (centered, an icon in a soft brand
 * circle, a warm title, a muted line, an optional action) is identical everywhere
 * instead of a bare line of gray text.
 *
 * Presentational and server-safe: no client-only hooks, so it renders from both server
 * components (the public catalog) and client components (the panel). A `cta` is either a
 * ready-made node (a button, a custom link) or a simple `{ label, href }` rendered as the
 * primary button; omit it where there is no next action.
 */
export function EmptyState({
  icon,
  title,
  description,
  cta,
  className = "",
}: {
  /** Shown above the text inside a soft brand circle. A sized icon element works best. */
  icon?: ReactNode;
  /** Short, warm headline (Spanish copy). */
  title: string;
  /** One muted line explaining the state / pointing the way (Spanish copy). */
  description?: ReactNode;
  /** Primary action: a link spec, or any node (button/link) for one-off cases. */
  cta?: { label: string; href: string } | ReactNode;
  /** Extra layout classes for one-off spacing needs — not for colors. */
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex max-w-sm flex-col items-center px-4 py-12 text-center ${className}`}
    >
      {icon && (
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand-darker">
          {icon}
        </span>
      )}
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      {cta != null && <div className="mt-5">{renderCta(cta)}</div>}
    </div>
  );
}

/** A `{ label, href }` spec becomes the primary button; anything else is rendered as-is. */
function renderCta(cta: { label: string; href: string } | ReactNode): ReactNode {
  if (
    cta != null &&
    typeof cta === "object" &&
    "label" in cta &&
    "href" in cta &&
    typeof (cta as { href: unknown }).href === "string" &&
    typeof (cta as { label: unknown }).label === "string"
  ) {
    const { label, href } = cta as { label: string; href: string };
    return (
      <Link href={href} className="btn btn-primary">
        {label}
      </Link>
    );
  }
  return cta as ReactNode;
}
