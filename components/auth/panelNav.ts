/**
 * Shared definition of the panel's account-area navigation, used by BOTH presentations: the
 * persistent desktop column (PanelSidebar) and the mobile dropdown opened from the header
 * avatar (AccountMenu). Keeping the entries in one place stops the two from drifting — add an
 * entry here and it appears in both.
 *
 * `isPanelLinkActive` is the active-section matching PanelNavLink applies per link.
 */

export interface PanelNavItem {
  href: string;
  label: string;
  /** When true, only the exact route is active (not nested routes under it). */
  exact?: boolean;
  /** Extra path prefixes that should also light this entry (e.g. management sub-flows). */
  extraPrefixes?: string[];
}

/** Personal nav, shown to every signed-in user. */
export const PANEL_NAV_ITEMS: PanelNavItem[] = [
  // "Mis páginas" stays active while managing a specific business/school, since those
  // sub-flows are launched from there.
  {
    href: "/panel",
    label: "Mis páginas",
    exact: true,
    extraPrefixes: ["/panel/business", "/panel/school"],
  },
  { href: "/panel/new", label: "Crear página" },
  { href: "/panel/donate", label: "Donar a una escuela" },
  { href: "/panel/donations", label: "Mis donaciones" },
  { href: "/panel/settings", label: "Configuración" },
];

/** Admin-only tools; rendered only for users whose role is `admin` (see AdminNavLink). */
export const ADMIN_NAV_ITEMS: PanelNavItem[] = [
  // exact: /panel/admin must not stay lit while on /panel/admin/categories.
  { href: "/panel/admin", label: "Verificar escuelas", exact: true },
  { href: "/panel/admin/categories", label: "Categorías" },
];

/**
 * Whether `item` is the active section for `pathname`. The link is active on its own route
 * and (unless `exact`) on any nested route under it. `extraPrefixes` covers sections
 * reachable from this entry but living under a different path.
 */
export function isPanelLinkActive(
  pathname: string,
  { href, exact = false, extraPrefixes = [] }: Omit<PanelNavItem, "label">,
): boolean {
  const matches = (base: string) =>
    pathname === base || pathname.startsWith(`${base}/`);
  if (pathname === href) return true;
  if (!exact && matches(href)) return true;
  return extraPrefixes.some(matches);
}
