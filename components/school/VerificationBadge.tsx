import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { SchoolVerificationStatus } from "@/types";

/**
 * School verification state. `verified` is the approved state; `pending` and
 * `needs_reverification` keep the payment methods hidden until an admin (re)approves.
 */
const MAP: Record<SchoolVerificationStatus, { tone: BadgeTone; label: string }> = {
  verified: { tone: "success", label: "Verificada" },
  pending: { tone: "warning", label: "Sin verificar" },
  needs_reverification: { tone: "warning", label: "Re-verificación pendiente" },
};

export function VerificationBadge({
  status,
}: {
  status: SchoolVerificationStatus;
}) {
  const { tone, label } = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
