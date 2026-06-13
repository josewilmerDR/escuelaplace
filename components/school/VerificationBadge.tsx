import type { SchoolVerificationStatus } from "@/types";

/**
 * School verification state. `verified` is the approved state; `pending` and
 * `needs_reverification` keep the payment methods hidden until an admin (re)approves.
 */
export function VerificationBadge({
  status,
}: {
  status: SchoolVerificationStatus;
}) {
  const styles: Record<SchoolVerificationStatus, string> = {
    verified: "bg-green-100 text-green-800",
    pending: "bg-amber-100 text-amber-800",
    needs_reverification: "bg-amber-100 text-amber-800",
  };
  const labels: Record<SchoolVerificationStatus, string> = {
    verified: "Verificada",
    pending: "Sin verificar",
    needs_reverification: "Re-verificación pendiente",
  };
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
