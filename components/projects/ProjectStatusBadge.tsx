import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { ProjectStatus } from "@/types";

/**
 * Status pill for a project. `active` is the default open state and renders nothing (an
 * "active" tag is noise on a list that's mostly active); only the closed states show.
 */
const MAP: Partial<Record<ProjectStatus, { tone: BadgeTone; label: string }>> = {
  completed: { tone: "success", label: "Completado" },
  cancelled: { tone: "neutral", label: "Cancelado" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const entry = MAP[status];
  if (!entry) return null;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
