"use client";

/**
 * Signed-in account control in the brand header (rendered by LoginButton). The button IS the
 * account avatar: the Google photo, or a person silhouette when there's none.
 *
 * Two behaviors, split at the same breakpoint the panel sidebar uses (md):
 *   - md and up: the avatar links straight to the panel, where the persistent left sidebar
 *     (PanelSidebar) carries the account nav. Desktop is unchanged from before.
 *   - below md: there is no in-panel sidebar, so the avatar instead opens a dropdown account
 *     menu — the account/panel nav collapsed behind the single header avatar (hamburger-style,
 *     but the trigger is the profile photo). Only choosing an entry navigates.
 *
 * It's a navigation disclosure (button toggles a region of links), not an ARIA menu widget —
 * `aria-expanded` + `aria-controls` over a labelled <nav> of <Link>s, keeping native link
 * semantics. The menu closes on: a link tap (incl. the already-active link, whose route
 * wouldn't change), a route change (back/forward), an outside click, and Escape.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { UserDoc } from "@/types";
import { UserIcon } from "@/components/ui/icons";
import { ActivityNavLink } from "./ActivityNavLink";
import { useAuth } from "./AuthProvider";
import { AdminNavLink } from "./AdminNavLink";
import { PanelNavLink } from "./PanelNavLink";
import { SignOutButton } from "./SignOutButton";
import { PANEL_NAV_ITEMS } from "./panelNav";

// Shared avatar chrome for the desktop link and the mobile trigger so the two are identical:
// the on-brand circle (white ring) the header has always used. The `display` utility is added
// per consumer (one is hidden below md, the other above it) — keeping `inline-flex` here would
// override their `hidden`/`md:hidden` and leak BOTH avatars onto the same breakpoint.
const AVATAR_CLASS =
  "h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-darkest text-white ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";

/** Photo (Google CDN) or the person-silhouette fallback. */
function AvatarMedia({ photo }: { photo?: string | null }) {
  if (!photo) return <UserIcon className="h-6 w-6" />;
  return (
    // next/image is overkill for a 40px third-party avatar and can't set the referrerPolicy
    // Google's photo CDN expects; a plain <img> is the right tool here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      width={40}
      height={40}
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover"
    />
  );
}

export function AccountMenu({ user }: { user: UserDoc }) {
  const { fbUser } = useAuth();
  const photo = fbUser?.photoURL;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Collapse when the route changes so the menu never lingers over the page the user just
  // chose (covers in-menu links AND browser back/forward). Adjusting state during render
  // against the previous pathname — React's documented pattern — rather than a pathname
  // effect, which would call setState synchronously inside an effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  // Standard disclosure dismissal: click outside the control or press Escape. Only wired
  // while open so there's no idle listener.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      {/* Desktop: avatar links straight to the panel (the in-panel sidebar handles nav). */}
      <Link
        href="/panel"
        title={user.name}
        aria-label={`Tu cuenta: ${user.name}`}
        className={`hidden md:inline-flex ${AVATAR_CLASS} ring-white/40 hover:ring-white/70`}
      >
        <AvatarMedia photo={photo} />
      </Link>

      {/* Mobile: avatar opens the account menu (no in-panel sidebar below md). */}
      <div ref={rootRef} className="relative md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls="account-menu"
          aria-label={open ? "Cerrar menú de cuenta" : "Abrir menú de cuenta"}
          className={`inline-flex ${AVATAR_CLASS} ${open ? "ring-white/80" : "ring-white/40 hover:ring-white/70"}`}
        >
          <AvatarMedia photo={photo} />
        </button>

        {open && (
          <div
            id="account-menu"
            // Closing on any link tap (delegated) also covers the already-active link, whose
            // route wouldn't change and so wouldn't trip the route-change reset above.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
            // Floating menu anchored under the avatar (header's right edge). z-50 keeps it above
            // the page; text-foreground resets the header's white text for the white card.
            className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl bg-white p-2 text-foreground shadow-lg ring-1 ring-border"
          >
            {/* Account identity at the top: tells the user which account the panel acts as. */}
            <div className="min-w-0 px-3 py-2">
              {user.name && (
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
              )}
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>

            <nav
              aria-label="Menú de cuenta"
              className="flex flex-col gap-1 border-t border-border pt-2"
            >
              {/* Global activity roll-up; renders nothing for users who manage no school. */}
              <ActivityNavLink block />
              {PANEL_NAV_ITEMS.map((item) => (
                <PanelNavLink key={item.href} {...item} block />
              ))}
              {/* Admin-only; renders nothing for regular users. */}
              <AdminNavLink block />
            </nav>

            <div className="mt-2 border-t border-border pt-2">
              <SignOutButton className="btn btn-secondary w-full" />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
