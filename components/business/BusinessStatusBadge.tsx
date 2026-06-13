import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { BusinessStatus } from "@/types";

/**
 * Publication status of a business page. `draft`/`active` are owner-controlled from the
 * edit page; `pending`/`suspended` are admin states.
 */
const MAP: Record<BusinessStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "Borrador" },
  pending: { tone: "warning", label: "En revisión" },
  active: { tone: "success", label: "Publicada" },
  suspended: { tone: "danger", label: "Suspendida" },
};

export function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  const { tone, label } = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
