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
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { AdminNavLink } from "./AdminNavLink";
import { SignOutButton } from "./SignOutButton";

export function PanelSidebar() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;

  return (
    <aside className="shrink-0 border-b pb-4 text-sm md:sticky md:top-6 md:h-fit md:w-48 md:self-start md:border-r md:border-b-0 md:pr-4 md:pb-0">
      <nav className="flex flex-wrap gap-x-5 gap-y-2 md:flex-col md:gap-2">
        <Link href="/panel">Mis páginas</Link>
        <Link href="/panel/new">Crear página</Link>
        <Link href="/panel/donate">Donar a una escuela</Link>
        {/* Admin-only; renders nothing for regular users (see AdminNavLink). */}
        <AdminNavLink className="font-medium text-brand-darker" />
      </nav>
      {/* Session action lives in the account area now — the header only shows the
          account name. A divider + muted styling sets it apart from the nav links. */}
      <div className="mt-4 md:mt-6 md:border-t md:border-border md:pt-6">
        <SignOutButton className="btn border border-border text-muted hover:bg-surface hover:text-foreground md:w-full" />
      </div>
    </aside>
  );
}
