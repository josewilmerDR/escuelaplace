"use client";

/**
 * Account-area sidebar for the panel. Rendered by the panel layout OUTSIDE <RequireAuth>
 * so it sits in the persistent layout: once signed in it stays mounted across navigation
 * between panel pages, so the menu never re-renders or flickers while the content swaps.
 *
 * It gates its own visibility on the session (returns null while auth resolves or when
 * signed out), so signed-out visitors see only the login prompt in the content area —
 * the same behavior as when <RequireAuth> wrapped the whole layout.
 */
import { useAuth } from "./AuthProvider";
import { AdminNavLink } from "./AdminNavLink";
import { PanelNavLink } from "./PanelNavLink";
import { SignOutButton } from "./SignOutButton";

export function PanelSidebar() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;

  return (
    <aside className="shrink-0 border-b border-border pb-4 text-sm md:sticky md:top-20 md:h-fit md:w-48 md:self-start md:border-r md:border-b-0 md:border-border md:pr-4 md:pb-0">
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
      {/* Session action lives in the account area now — the header only shows the
          account name. A divider + muted styling sets it apart from the nav links. */}
      <div className="mt-4 md:mt-6 md:border-t md:border-border md:pt-6">
        <SignOutButton className="btn btn-secondary md:w-full" />
      </div>
    </aside>
  );
}
