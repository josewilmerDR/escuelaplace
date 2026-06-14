import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Pill nav chip — the rounded outline pill used for category links and filters. One
 * geometry everywhere (`rounded-full border px-4 py-2.5 text-sm`) so the browse chips on
 * the home row, the search filters and the category list on a profile read as the same
 * control. This is the LARGER of the two pills; status/label pills are `Badge`, and
 * metric/trust pills with an icon are `StatChip`.
 *
 * Renders as a `Link` when given `href`, a `button` when given `onClick`, else a plain
 * `span`. Server-safe: passing `onClick` from a client component is fine; the chip itself
 * has no client hooks.
 */
export function Chip({
  href,
  onClick,
  icon,
  emphasis = "muted",
  className = "",
  children,
  ...rest
}: {
  href?: string;
  onClick?: () => void;
  /** Leading icon (e.g. a category glyph). */
  icon?: ReactNode;
  /** "muted" = neutral browse chip; "brand" = the highlighted "see all" chip. */
  emphasis?: "muted" | "brand";
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const tone =
    emphasis === "brand"
      ? "text-brand-darker hover:border-brand-dark"
      : "text-muted hover:border-brand-dark hover:text-brand-darker";
  const classes =
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium transition-colors ${tone} ${className}`.trim();

  const inner = (
    <>
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} {...rest}>
        {inner}
      </button>
    );
  }
  return (
    <span className={classes} {...rest}>
      {inner}
    </span>
  );
}
