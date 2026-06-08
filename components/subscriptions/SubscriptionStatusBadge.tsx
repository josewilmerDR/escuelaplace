import type { SubscriptionStatus } from "@/types";

const STATUS: Record<SubscriptionStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmada", className: "bg-green-100 text-green-800" },
  expiring: { label: "Por vencer", className: "bg-orange-100 text-orange-800" },
  expired: { label: "Vencida", className: "bg-gray-100 text-gray-600" },
};

export function SubscriptionStatusBadge({
  status,
}: {
  status: SubscriptionStatus;
}) {
  const s = STATUS[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${s.className}`}>
      {s.label}
    </span>
  );
}
