"use client";

/**
 * FB-style section tab strip for the public profile pages (business and school). Unlike the
 * old SectionTabs (in-page # anchors with a scroll-spy), each tab is now a real route, so
 * the strip is a row of <Link>s and the active one is decided by the current pathname — the
 * sections live at their own URLs (/school/[id], /school/[id]/photos, …) and the shared
 * layout keeps this strip mounted while only the section content swaps underneath.
 *
 * The strip is a single-row horizontal carousel: it NEVER wraps to a second line. When the
 * tabs overflow (narrow screens, many sections) it scrolls horizontally with the scrollbar
 * hidden, and fade gradients at whichever edge has hidden content hint that more tabs are
 * there. On mount and after each scroll we recompute which edges overflow; the active tab is
 * also scrolled into view so a deep-linked section never lands off-screen.
 *
 * Client island: it needs usePathname to highlight the active tab and a scroll listener for
 * the fades. The links are plain <Link>s, so navigation works regardless.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ProfileTab {
  /** Absolute route the tab points to (e.g. "/school/abc" or "/school/abc/photos"). */
  href: string;
  label: string;
  /** Optional content count, rendered as a soft trailing number so the tab previews how much
   *  it holds. Omit (or pass 0) to show the label alone. */
  count?: number;
}

export function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  // Which edges have content scrolled out of view → drives the fade overlays.
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const recomputeFades = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setOverflow({
      left: scrollLeft > 1,
      // -1 to absorb sub-pixel rounding so a fully-scrolled strip drops the fade.
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  // Recompute on mount and whenever the viewport resizes (tabs may start/stop overflowing).
  useEffect(() => {
    recomputeFades();
    window.addEventListener("resize", recomputeFades);
    return () => window.removeEventListener("resize", recomputeFades);
  }, [recomputeFades, tabs]);

  // Keep the active tab visible — a deep link to an overflowed section would otherwise open
  // with that tab off-screen. Scroll ONLY the strip horizontally, never the page: an earlier
  // scrollIntoView({ block: "nearest" }) also moved the document vertically, jumping visitors
  // down to the tab strip (which sits below the fold under the tall cover/avatar header) instead
  // of landing them at the top of the page.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (scroller && active) {
      const a = active.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      if (a.left < s.left) scroller.scrollBy({ left: a.left - s.left - 8 });
      else if (a.right > s.right) scroller.scrollBy({ left: a.right - s.right + 8 });
    }
    recomputeFades();
  }, [pathname, recomputeFades]);

  return (
    <div className="relative -mx-2 mt-5 border-t border-border pt-1">
      {/* Edge fades: pointer-events-none so they never swallow a tap on the tab beneath. */}
      {overflow.left && (
        <div className="pointer-events-none absolute inset-y-1 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
      )}
      {overflow.right && (
        <div className="pointer-events-none absolute inset-y-1 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
      )}
      <nav
        ref={scrollerRef}
        onScroll={recomputeFades}
        aria-label="Secciones de la página"
        className="no-scrollbar flex gap-1 overflow-x-auto scroll-smooth"
      >
        {tabs.map(({ href, label, count }) => {
          // The index tab matches only its exact path; the others match their own path so a
          // deeper child route (none today, but e.g. a future /photos/[i]) still highlights it.
          const isActive =
            pathname === href ||
            (href !== tabs[0]?.href && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              ref={isActive ? activeRef : undefined}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`relative shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "text-brand-darker after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand"
                  : "text-muted hover:bg-surface hover:text-brand-darker"
              }`}
            >
              {label}
              {typeof count === "number" && count > 0 && (
                <span className="ml-1.5 align-baseline text-xs font-normal tabular-nums opacity-70">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
