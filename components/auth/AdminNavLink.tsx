"use client";

/**
 * Panel nav entries for the admin tools (school verification queue + category management).
 * Render only for users whose Firestore role is `admin`, so regular page owners never see
 * them. This is a UX affordance, not a security boundary — each page and firestore.rules
 * enforce admin access regardless.
 *
 * Renders as its own labelled group ("Administración") separated by a divider, so admin
 * tools read apart from the personal nav. Delegates to PanelNavLink so each entry gets the
 * same active-section highlight as the other sidebar entries.
 */
import { useAuth } from "./AuthProvider";
import { PanelNavLink } from "./PanelNavLink";

export function AdminNavLink() {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;
  return (
    // Full-width separator block so the divider/heading span the row in both layouts
    // (flex-wrap on mobile, flex-col on md), setting admin tools apart from personal nav.
    <div className="mt-3 flex w-full basis-full flex-col gap-1 border-t border-border pt-3 md:mt-2 md:pt-3">
      <p className="px-3 text-xs uppercase tracking-wide text-muted">
        Administración
      </p>
      {/* exact: /panel/admin must not stay lit while on /panel/admin/categories. */}
      <PanelNavLink href="/panel/admin" label="Verificar escuelas" exact />
      <PanelNavLink href="/panel/admin/categories" label="Categorías" />
    </div>
  );
}
