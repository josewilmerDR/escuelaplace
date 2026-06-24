"use client";

/**
 * Admin strip on the public tool detail page, visible only to the people who manage the
 * school (owner, editors, or platform admin). Client island — the SSR page doesn't know who
 * is looking, so it renders nothing for visitors and never shifts their layout. Mirrors
 * ProjectManageBar (edit link + "ver como visitante"); tools have no confirmation queue, so
 * there is no pending badge.
 */
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { VisitorModeToast } from "@/components/ui/VisitorModeToast";
import { PencilIcon } from "@/components/ui/icons";
import { useViewAsVisitor } from "@/lib/view-as";

export function ToolManageBar({
  schoolId,
  toolId,
  ownerId,
  editorIds,
}: {
  schoolId: string;
  toolId: string;
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

  if (!canManage) return null;
  if (asVisitor) return <VisitorModeToast />;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-surface px-4 py-3 ring-1 ring-black/5 sm:justify-start">
      <p className="text-sm font-medium text-muted">Administras esta actividad</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={`/panel/school/${schoolId}/tools/${toolId}`}
          className="btn btn-outline"
        >
          <PencilIcon className="mr-2 h-4 w-4" />
          Editar actividad
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
