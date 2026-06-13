"use client";

/**
 * Panel nav entry for the admin verification queue. Renders only for users whose Firestore
 * role is `admin`, so regular page owners never see it. This is a UX affordance, not a
 * security boundary — the queue page and firestore.rules enforce admin access regardless.
 *
 * Delegates to PanelNavLink so it gets the same active-section highlight as the other
 * sidebar entries.
 */
import { useAuth } from "./AuthProvider";
import { PanelNavLink } from "./PanelNavLink";

export function AdminNavLink() {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;
  return <PanelNavLink href="/panel/admin" label="Verificar escuelas" />;
}
