"use client";

/**
 * A single panel-sidebar nav link that highlights itself when its section is active, so the
 * user always knows where they are in the panel. Shared by PanelSidebar and AdminNavLink so
 * every entry gets the same active treatment (and the same hover/spacing).
 *
 * Matching: the link is active on its own route and (unless `exact`) on any nested route
 * under it. `extraPrefixes` covers sections reachable from this entry but living under a
 * different path — e.g. "Mis páginas" stays lit while managing a specific business/school.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(
  pathname: string,
  href: string,
  exact: boolean,
  extraPrefixes: string[],
): boolean {
  const matches = (base: string) =>
    pathname === base || pathname.startsWith(`${base}/`);
  if (pathname === href) return true;
  if (!exact && matches(href)) return true;
  return extraPrefixes.some(matches);
}

export function PanelNavLink({
  href,
  label,
  exact = false,
  extraPrefixes = [],
}: {
  href: string;
  label: string;
  /** When true, only the exact route is active (not nested routes under it). */
  exact?: boolean;
  /** Extra path prefixes that should also light this entry (e.g. management sub-flows). */
  extraPrefixes?: string[];
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href, exact, extraPrefixes);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // Active: a soft filled brand pill. Inactive: quiet muted text that lifts to a
      // surface fill on hover — the same quiet-chip language as the panel card actions.
      className={`rounded-lg px-3 py-2 transition-colors ${
        active
          ? "bg-brand-tint font-semibold text-brand-darker"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
