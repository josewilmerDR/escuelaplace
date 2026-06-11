import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { LoginButton } from "@/components/auth/LoginButton";

/**
 * Layout for the private route group (the user's panel).
 * The `(panel)` group adds no URL segment: routes live under /panel/*.
 *
 * Access is gated client-side by <RequireAuth> (UX gate; real security is in
 * firestore.rules). A user administers one or more "pages" (businesses/schools).
 *
 * Below md the sidebar collapses into a wrapping top bar (nav links + session button);
 * a fixed 192px column would leave ~90px of content on a 360px viewport.
 */
export default function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireAuth>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:px-6 md:py-8">
        <aside className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm md:block md:w-48 md:border-r md:border-b-0 md:pr-4 md:pb-0">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 md:flex-col md:gap-2">
            <Link href="/panel">Mis páginas</Link>
            <Link href="/panel/new">Crear página</Link>
            <Link href="/panel/donate">Donar a una escuela</Link>
          </nav>
          <div className="md:mt-6">
            <LoginButton variant="primary" />
          </div>
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </RequireAuth>
  );
}
