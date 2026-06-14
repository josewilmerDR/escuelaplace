"use client";

/**
 * Panel nav entries for the admin tools (school verification queue + category management).
 * Render only for users whose Firestore role is `admin`, so regular page owners never see
 * them. This is a UX affordance, not a security boundary — each page and firestore.rules
 * enforce admin access regardless.
 *
 * Delegates to PanelNavLink so each gets the same active-section highlight as the other
 * sidebar entries.
 */
import { useAuth } from "./AuthProvider";
import { PanelNavLink } from "./PanelNavLink";

export function AdminNavLink() {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;
  return (
    <>
      {/* exact: /panel/admin must not stay lit while on /panel/admin/categories. */}
      <PanelNavLink href="/panel/admin" label="Verificar escuelas" exact />
      <PanelNavLink href="/panel/admin/categories" label="Categorías" />
    </>
  );
}
