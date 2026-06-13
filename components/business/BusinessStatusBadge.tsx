import type { BusinessStatus } from "@/types";

/**
 * Publication status of a business page. `draft`/`active` are owner-controlled from the
 * edit page; `pending`/`suspended` are admin states.
 */
export function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  const styles: Record<BusinessStatus, string> = {
    draft: "bg-gray-100 text-gray-700",
    pending: "bg-amber-100 text-amber-800",
    active: "bg-green-100 text-green-800",
    suspended: "bg-red-100 text-red-800",
  };
  const labels: Record<BusinessStatus, string> = {
    draft: "Borrador",
    pending: "En revisión",
    active: "Publicada",
    suspended: "Suspendida",
  };
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
