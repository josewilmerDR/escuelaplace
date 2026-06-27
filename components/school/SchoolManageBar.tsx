"use client";

/**
 * Manage controls for the people who run the school page (owner, editors, or platform
 * admin) — pinned on top of the profile cover, FB-page style. Client island: the SSR page
 * doesn't know who is looking, so this renders nothing for visitors and never shifts their
 * layout. Passed to ProfileHeader as `coverOverlay`, so it positions itself against the
 * cover band (which is `relative`).
 *
 * Two affordances, split by intent — manage vs. attend to:
 *  - a BELL pinned top-right, badged with how many items await confirmation (the activity
 *    queue), linking straight to it;
 *  - a GEAR pinned bottom-right opening the "Configurar" menu (edit page, projects, tools,
 *    and "Ver como visitante").
 *
 * "Ver como visitante" flips the shared view-as store: the whole overlay collapses into the
 * floating exit pill (VisitorModeToast), so the manager sees exactly what a visitor gets and
 * the mode can't get stuck on invisibly.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { VisitorModeToast } from "@/components/ui/VisitorModeToast";
import {
  BellIcon,
  CogIcon,
  EyeIcon,
  FlagIcon,
  HeartIcon,
  PencilIcon,
  WrenchIcon,
} from "@/components/ui/icons";
import { getPendingActivityCountBySchool } from "@/lib/firestore";
import { useViewAsVisitor } from "@/lib/view-as";
import { isPageManager } from "@/lib/permissions";

/** Circular cover-overlay button: legible on any cover photo via a translucent dark scrim. */
const OVERLAY_BTN =
  "inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow-sm ring-1 ring-white/25 backdrop-blur transition hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function SchoolManageBar({
  schoolId,
  ownerId,
  editorIds,
}: {
  schoolId: string;
  ownerId: string;
  editorIds?: string[];
}) {
  const { user } = useAuth();
  const [asVisitor, setAsVisitor] = useViewAsVisitor();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canManage = isPageManager({ ownerId, editorIds }, user);

  // How many items (supports, project aportes, tool orders) are awaiting confirmation — the
  // bell badge so the board sees the queue even when it's just viewing the public page.
  // Managers only; never for visitors.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    getPendingActivityCountBySchool(schoolId)
      .then((count) => {
        if (!cancelled) setPendingCount(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canManage, schoolId]);

  // Dismiss the "Configurar" menu on outside click or Escape — standard popover behavior.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!canManage) return null;

  // In visitor mode the whole overlay collapses with the rest of the owner-only UI; the
  // shared floating pill is the only trace, so the mode can't get stuck on invisibly.
  if (asVisitor) return <VisitorModeToast />;

  return (
    <>
      {/* Bell — "attend to": the confirmation queue, badged with its count. */}
      <Link
        href={`/panel/school/${schoolId}/activity`}
        aria-label={
          pendingCount > 0
            ? `Actividad (${pendingCount} pendientes)`
            : "Actividad"
        }
        className={`absolute right-3 top-3 z-20 ${OVERLAY_BTN}`}
      >
        <BellIcon className="h-5 w-5" />
        {pendingCount > 0 && (
          // Red is the universal "needs attention" notification cue — no token equivalent on
          // the scale; the white ring lifts it off the cover photo.
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white">
            {pendingCount}
          </span>
        )}
      </Link>

      {/* Gear — "manage": the low-frequency page-management menu. */}
      <div ref={menuRef} className="absolute bottom-3 right-3 z-20">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Configurar página"
          className={OVERLAY_BTN}
        >
          <CogIcon className="h-5 w-5" />
        </button>

        {menuOpen && (
          // Opens downward (top-full) into the header body, never above the cover, so the
          // header's overflow-hidden can't clip it.
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/10"
          >
            <MenuLink
              href={`/panel/school/${schoolId}/edit`}
              icon={<PencilIcon className="h-4 w-4" />}
            >
              Editar página
            </MenuLink>
            <MenuLink
              href={`/panel/school/${schoolId}/projects`}
              icon={<FlagIcon className="h-4 w-4" />}
            >
              Proyectos
            </MenuLink>
            <MenuLink
              href={`/panel/school/${schoolId}/tools`}
              icon={<WrenchIcon className="h-4 w-4" />}
            >
              Herramientas
            </MenuLink>
            <MenuLink
              href={`/panel/school/${schoolId}/thanks`}
              icon={<HeartIcon className="h-4 w-4" />}
            >
              Agradecimientos
            </MenuLink>
            <div className="my-1 h-px bg-black/5" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAsVisitor(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-foreground hover:bg-surface"
            >
              <span className="text-muted">
                <EyeIcon className="h-4 w-4" />
              </span>
              Ver como visitante
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </Link>
  );
}
