import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { SubscriptionStatus } from "@/types";

const MAP: Record<SubscriptionStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: "warning", label: "Pendiente" },
  confirmed: { tone: "success", label: "Confirmada" },
  expiring: { tone: "alert", label: "Por vencer" },
  expired: { tone: "neutral", label: "Vencida" },
};

export function SubscriptionStatusBadge({
  status,
}: {
  status: SubscriptionStatus;
}) {
  const { tone, label } = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
