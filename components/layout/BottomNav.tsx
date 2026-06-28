"use client";

/**
 * Mobile bottom navigation (YouTube/X style): a fixed bar pinned to the bottom of the
 * viewport with the catalog's primary destinations. Mobile-only (`sm:hidden`) — on desktop
 * these same destinations live in the brand header's browse cluster (see HeaderBrowse), so
 * the bar would be redundant there.
 *
 * Client island because it reads usePathname() to highlight the active tab; everything else
 * in the app shell (SiteHeader) stays a server component.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AcademicCapIcon,
  HeartIcon,
  HomeIcon,
  SearchIcon,
  StorefrontIcon,
} from "@/components/ui/icons";

// One entry per tab. `match` decides the active (highlighted) state: it covers both the
// listing route and its public detail pages (e.g. Escuelas stays active on /school/[id])
// so the bar reflects where the buyer is, not just exact-path hits.
const ITEMS = [
  { href: "/", label: "Inicio", Icon: HomeIcon, match: (p: string) => p === "/" },
  {
    href: "/search",
    label: "Buscar",
    Icon: SearchIcon,
    match: (p: string) => p.startsWith("/search"),
  },
  {
    href: "/businesses",
    label: "Comercios",
    Icon: StorefrontIcon,
    match: (p: string) => p.startsWith("/business"),
  },
  {
    href: "/schools",
    label: "Escuelas",
    Icon: AcademicCapIcon,
    match: (p: string) => p.startsWith("/school"),
  },
  {
    href: "/panel/donate",
    label: "Donar",
    Icon: HeartIcon,
    match: (p: string) => p.startsWith("/panel/donate"),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    // Fixed bar with a top hairline + safe-area padding so it clears the iOS home indicator
    // (bottom inset) and the landscape display cutout (left/right insets). These env() values
    // only resolve once viewport-fit:cover is set in the root layout's viewport export.
    // z-40 matches the header so neither overlaps page modals unexpectedly.
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-0.5 py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "text-brand-darker"
                    : "text-slate-500 hover:text-brand-darker"
                }`}
              >
                <Icon className="h-6 w-6 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
