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
 *
 * Each panel page renders its own <main>, so the content wrapper below is a plain styling
 * <div> (a layout box with no accessible name), not a landmark element.
 */
export default function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:px-6 md:py-8">
      <PanelSidebar />
      {/* The content box fills the remaining canvas width beside the sidebar (flex-1, no
          max-w cap) so the panel matches the home column. No mx-auto keeps it LEFT-aligned
          and in the exact same place across navigations — pages must not re-introduce
          mx-auto or a max-w cap (either would re-center/shrink the box and shift it
          horizontally between navigations). min-h reserves vertical space so the global
          footer doesn't bounce while the loader/skeleton is short. */}
      <div className="min-h-[60vh] min-w-0 flex-1">
        <RequireAuth>{children}</RequireAuth>
      </div>
    </div>
  );
}
