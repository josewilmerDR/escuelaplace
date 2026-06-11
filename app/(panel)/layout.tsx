import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { LoginButton } from "@/components/auth/LoginButton";

/**
 * Layout for the private route group (the user's panel).
 * The `(panel)` group adds no URL segment: routes live under /panel/*.
 *
 * Access is gated client-side by <RequireAuth> (UX gate; real security is in
 * firestore.rules). A user administers one or more "pages" (businesses/schools).
 */
export default function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireAuth>
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        <aside className="w-48 shrink-0 border-r pr-4 text-sm">
          <nav className="flex flex-col gap-2">
            <Link href="/panel">Mis páginas</Link>
            <Link href="/panel/new">Crear página</Link>
            <Link href="/panel/donate">Donar a una escuela</Link>
          </nav>
          <div className="mt-6">
            <LoginButton variant="primary" />
          </div>
        </aside>
        <section className="flex-1">{children}</section>
      </div>
    </RequireAuth>
  );
}
