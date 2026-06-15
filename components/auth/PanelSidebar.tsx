"use client";

/**
 * Account-area sidebar for the panel. Rendered by the panel layout OUTSIDE <RequireAuth>
 * so it sits in the persistent layout: the <aside> never remounts across panel navigation
 * (only the active-link styling updates via usePathname inside each PanelNavLink), so the
 * menu doesn't flicker while the content swaps.
 *
 * It gates its own visibility on the session: while auth resolves it renders a same-size
 * skeleton aside (so the content doesn't shift sideways when the real menu appears), and
 * once signed out it returns null — signed-out visitors see only the login prompt in the
 * content area, the same behavior as when <RequireAuth> wrapped the whole layout.
 */
import { useAuth } from "./AuthProvider";
import { AdminNavLink } from "./AdminNavLink";
import { PanelNavLink } from "./PanelNavLink";
import { SignOutButton } from "./SignOutButton";

// Shared so the skeleton aside matches the real one's footprint exactly (md:w-48 + the
// shrink/border classes), keeping the content column from shifting when the menu resolves.
const ASIDE_CLASS =
  "shrink-0 border-b border-border pb-4 text-sm md:sticky md:top-20 md:h-fit md:w-48 md:self-start md:border-r md:border-b-0 md:border-border md:pr-4 md:pb-0";

/**
 * Same-size placeholder shown while auth resolves: a couple of muted pulse bars in an aside
 * with identical dimensions, so the real menu doesn't pop in and shift the content sideways.
 * Mirrors the card-placeholder style of PanelHomeSkeleton; reduced-motion is honored globally.
 */
function SkeletonAside() {
  return (
    <aside className={ASIDE_CLASS} aria-hidden="true">
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
    <aside className={ASIDE_CLASS}>
      <nav className="flex flex-wrap gap-x-2 gap-y-1 md:flex-col md:gap-1">
        {/* "Mis páginas" stays active while managing a specific business/school, since
            those sub-flows are launched from there. */}
        <PanelNavLink
          href="/panel"
          label="Mis páginas"
          exact
          extraPrefixes={["/panel/business", "/panel/school"]}
        />
        <PanelNavLink href="/panel/new" label="Crear página" />
        <PanelNavLink href="/panel/donate" label="Donar a una escuela" />
        <PanelNavLink href="/panel/settings" label="Configuración" />
        {/* Admin-only; renders nothing for regular users (see AdminNavLink). */}
        <AdminNavLink />
      </nav>
      {/* Account identity + session action. Naming the signed-in account here (name + email)
          tells the user which account the panel is acting as. A divider + muted styling sets
          it apart from the nav links. */}
      <div className="mt-4 md:mt-6 md:border-t md:border-border md:pt-6">
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
