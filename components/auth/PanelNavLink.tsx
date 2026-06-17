"use client";

/**
 * A single panel-sidebar nav link that highlights itself when its section is active, so the
 * user always knows where they are in the panel. Shared by PanelSidebar, AdminNavLink and the
 * header avatar's dropdown (AccountMenu) so every entry gets the same active treatment (and
 * the same hover/spacing). Matching lives in `isPanelLinkActive` (panelNav.ts).
 *
 * Layout: the default `inline-flex` pill suits the desktop column. Pass `block` for the mobile
 * dropdown, where each entry is a full-width row (`flex w-full`) so the menu reads as a stacked
 * list of tappable rows rather than a wrapping cloud of chips.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPanelLinkActive } from "./panelNav";

export function PanelNavLink({
  href,
  label,
  exact = false,
  extraPrefixes = [],
  block = false,
}: {
  href: string;
  label: string;
  /** When true, only the exact route is active (not nested routes under it). */
  exact?: boolean;
  /** Extra path prefixes that should also light this entry (e.g. management sub-flows). */
  extraPrefixes?: string[];
  /** Render as a full-width row instead of an inline pill (for the mobile dropdown). */
  block?: boolean;
}) {
  const pathname = usePathname();
  const active = isPanelLinkActive(pathname, { href, exact, extraPrefixes });

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // Active: a soft filled brand pill. Inactive: quiet muted text that lifts to a
      // surface fill on hover — the same quiet-chip language as the panel card actions.
      // min-h-10 holds the ≥40px tap target the design system requires; the focus-visible
      // ring matches the shared .btn primitive so keyboard nav is visible.
      className={`${block ? "flex w-full" : "inline-flex"} min-h-10 items-center rounded-lg px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        active
          ? "bg-brand-tint font-semibold text-brand-darker"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
