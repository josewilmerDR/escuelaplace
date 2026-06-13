import type { ProjectStatus } from "@/types";

/**
 * Status pill for a project. `active` is the default open state and renders nothing (an
 * "active" tag is noise on a list that's mostly active); only the closed states show.
 */
const STATUS: Partial<
  Record<ProjectStatus, { label: string; className: string }>
> = {
  completed: { label: "Completado", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelado", className: "bg-gray-100 text-muted" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];
  if (!s) return null;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${s.className}`}>
      {s.label}
    </span>
  );
}
