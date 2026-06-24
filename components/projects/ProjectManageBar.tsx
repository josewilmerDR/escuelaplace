"use client";

/**
 * Admin strip on the public project detail page, visible only to the people who manage the
 * project (school owner, editors, or platform admin). Client island — the SSR page doesn't
 * know who is looking at it; renders nothing for everyone else, so the layout never shifts
 * for visitors. Mirrors the school ManageBar, but its links point at the project's own panel
 * surfaces (edit + the project-contributions confirmation queue).
 *
 * "Ver como visitante" reuses the shared view-as store: the strip collapses into the
 * floating exit pill so the manager sees exactly what a visitor gets.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { VisitorModeToast } from "@/components/ui/VisitorModeToast";
import { getPendingContributionsBySchool } from "@/lib/firestore";
import { useViewAsVisitor } from "@/lib/view-as";

export function ProjectManageBar({
  schoolId,
  projectId,
  ownerId,
  editorIds,
}: {
  schoolId: string;
  projectId: string;
  ownerId: string;
  editorIds?: string[];
}) {
  const { user } = useAuth();
  const [asVisitor, setAsVisitor] = useViewAsVisitor();
  const canManage =
    user &&
    (user.id === ownerId ||
      editorIds?.includes(user.id) ||
      user.role === "admin");

  // How many contributions are awaiting confirmation — a nudge badge so the board sees the
  // queue even when it's just viewing the public page. Managers only; never for visitors.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    getPendingContributionsBySchool(schoolId)
      .then((contribs) => {
        if (!cancelled) setPendingCount(contribs.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canManage, schoolId]);

  if (!canManage) return null;

  if (asVisitor) return <VisitorModeToast />;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-surface px-4 py-3 ring-1 ring-black/5 sm:justify-start">
      <p className="text-sm font-medium text-muted">
        Administras este proyecto
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={`/panel/school/${schoolId}/projects/${projectId}`}
          className="btn btn-outline"
        >
          <PencilIcon className="mr-2 h-4 w-4" />
          Editar proyecto
        </Link>
        <Link
          href={`/panel/school/${schoolId}/project-contributions`}
          className="btn btn-outline"
        >
          Confirmar aportes
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-darker px-1.5 text-xs font-semibold text-white">
              {pendingCount}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setAsVisitor(true)}
          className="btn btn-outline"
        >
          <EyeIcon className="mr-2 h-4 w-4" />
          Ver como visitante
        </button>
      </div>
    </div>
  );
}

/** Heroicons pencil (outline) — same inline-SVG approach as the page icons. */
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}
