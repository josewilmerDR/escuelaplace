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
import { EyeIcon, PencilIcon } from "@/components/ui/icons";
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
