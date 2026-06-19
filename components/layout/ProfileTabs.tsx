"use client";

/**
 * FB-style section tab strip for the public profile pages (business and school). Unlike the
 * old SectionTabs (in-page # anchors with a scroll-spy), each tab is now a real route, so
 * the strip is a row of <Link>s and the active one is decided by the current pathname — the
 * sections live at their own URLs (/school/[id], /school/[id]/photos, …) and the shared
 * layout keeps this strip mounted while only the section content swaps underneath.
 *
 * Client island: it needs usePathname to highlight the active tab. The links are plain
 * <Link>s, so navigation works regardless; the island only adds the highlight.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ProfileTab {
  /** Absolute route the tab points to (e.g. "/school/abc" or "/school/abc/photos"). */
  href: string;
  label: string;
}

export function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones de la página"
      className="-mx-2 mt-5 flex justify-center gap-1 overflow-x-auto border-t border-border pt-1 sm:justify-start"
    >
      {tabs.map(({ href, label }) => {
        // The index tab matches only its exact path; the others match their own path so a
        // deeper child route (none today, but e.g. a future /photos/[i]) still highlights it.
        const isActive =
          pathname === href ||
          (href !== tabs[0]?.href && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`relative shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "text-brand-darker after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand"
                : "text-muted hover:bg-surface hover:text-brand-darker"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
