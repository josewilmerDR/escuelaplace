import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Layout for the private route group (the user's panel).
 * The `(panel)` group adds no URL segment: routes live under /panel/*.
 *
 * Access is gated client-side by <RequireAuth> (UX gate; real security is in
 * firestore.rules). A user administers one or more "pages" (businesses/schools).
 *
 * Below md the sidebar collapses into a wrapping top bar of nav links; a fixed 192px
 * column would leave ~90px of content on a 360px viewport. Session actions (sign in/out)
 * live in the global <SiteHeader> (app/layout.tsx), so the sidebar holds only navigation.
 */
export default function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireAuth>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:px-6 md:py-8">
        <aside className="shrink-0 border-b pb-4 text-sm md:w-48 md:border-r md:border-b-0 md:pr-4 md:pb-0">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 md:flex-col md:gap-2">
            <Link href="/panel">Mis páginas</Link>
            <Link href="/panel/new">Crear página</Link>
            <Link href="/panel/donate">Donar a una escuela</Link>
          </nav>
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </RequireAuth>
  );
}
