import { PanelSidebar } from "@/components/auth/PanelSidebar";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Layout for the private route group (the user's panel).
 * The `(panel)` group adds no URL segment: routes live under /panel/*.
 *
 * Access is gated client-side by <RequireAuth> (UX gate; real security is in
 * firestore.rules). A user administers one or more "pages" (businesses/schools).
 *
 * The sidebar (<PanelSidebar>) sits OUTSIDE <RequireAuth>, in the persistent layout, and
 * gates its own visibility on the session. So once signed in it stays mounted across
 * navigation between panel pages — only the content <section> re-renders, keeping the menu
 * flicker-free. Below md the sidebar collapses into a wrapping top bar; a fixed 192px column
 * would leave ~90px of content on a 360px viewport. Signing in is in the global
 * <SiteHeader>; signing out lives here in the account area.
 */
export default function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:px-6 md:py-8">
      <PanelSidebar />
      {/* The content box is a single, fixed, LEFT-aligned rectangle owned here in the
          persistent layout: capped width + no mx-auto means every panel page renders in
          the exact same place. Pages must not re-introduce mx-auto (that would re-center
          and shift the box horizontally between navigations). */}
      <section className="min-w-0 max-w-2xl flex-1">
        <RequireAuth>{children}</RequireAuth>
      </section>
    </div>
  );
}
