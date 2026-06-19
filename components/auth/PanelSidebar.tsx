"use client";

/**
 * Account-area navigation for the panel. Rendered by the panel layout OUTSIDE <RequireAuth>
 * so it sits in the persistent layout: it never remounts across panel navigation (only the
 * active-link styling updates via usePathname), so the menu doesn't flicker while the content
 * swaps.
 *
 * This is the md-and-up presentation only: a persistent left <aside> column, listing the
 * shared nav entries (PANEL_NAV_ITEMS in panelNav.ts). Below md there is no sidebar — the same
 * account nav is reached from the header avatar's dropdown (see AccountMenu), so the panel body
 * isn't cluttered with a second nav.
 *
 * It gates its own visibility on the session: while auth resolves it renders a same-size
 * skeleton (so the content doesn't shift when the real menu appears), and once signed out it
 * returns null — signed-out visitors see only the login prompt in the content area, the same
 * behavior as when <RequireAuth> wrapped the whole layout.
 */
import { ActivityNavLink } from "./ActivityNavLink";
import { useAuth } from "./AuthProvider";
import { AdminNavLink } from "./AdminNavLink";
import { PanelNavLink } from "./PanelNavLink";
import { SignOutButton } from "./SignOutButton";
import { PANEL_NAV_ITEMS } from "./panelNav";

// Desktop-only column (hidden below md, where the header avatar's menu takes over). Shared
// with the skeleton so the placeholder matches the real one's footprint exactly (md:w-48 +
// the sticky/border classes), keeping the content from shifting when the menu resolves.
const DESKTOP_ASIDE_CLASS =
  "hidden shrink-0 text-sm md:sticky md:top-20 md:block md:h-fit md:w-48 md:self-start md:border-r md:border-border md:pr-4";

/**
 * Same-size placeholder shown while auth resolves: a couple of muted pulse bars in the desktop
 * column, so the real menu doesn't pop in and shift the content. Below md it collapses to
 * nothing (like the real aside) — there the loading state lives in the header avatar instead.
 * Reduced-motion is honored globally.
 */
function SkeletonAside() {
  return (
    <aside className={DESKTOP_ASIDE_CLASS} aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="h-8 animate-pulse rounded-lg bg-surface" />
        <div className="h-8 animate-pulse rounded-lg bg-surface" />
      </div>
    </aside>
  );
}

export function PanelSidebar() {
  const { user, loading } = useAuth();
  if (loading) return <SkeletonAside />;
  if (!user) return null;

  return (
    // Desktop: persistent left column (hidden below md — see the header avatar's menu there).
    <aside className={DESKTOP_ASIDE_CLASS}>
      <nav className="flex flex-col gap-1">
        {/* Global activity roll-up; renders nothing for users who manage no school. */}
        <ActivityNavLink />
        {PANEL_NAV_ITEMS.map((item) => (
          <PanelNavLink key={item.href} {...item} />
        ))}
        {/* Admin-only; renders nothing for regular users (see AdminNavLink). */}
        <AdminNavLink />
      </nav>
      {/* Account identity + session action. Naming the signed-in account here (name + email)
          tells the user which account the panel is acting as. A divider + muted styling sets
          it apart from the nav links. */}
      <div className="mt-6 border-t border-border pt-6">
        <div className="mb-3 min-w-0">
          {user.name && (
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          )}
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <SignOutButton className="btn btn-secondary md:w-full" />
      </div>
    </aside>
  );
}
