import { CheckIcon } from "@/components/ui/icons";

/**
 * Transient "saved" confirmation shown next to a form's save button. Purely presentational:
 * the page owns the `show` flag and clears it (on the next edit/submit, and on a short timer
 * so it reads as a confirmation, not a permanent label). A success-toned pill with a check —
 * far harder to miss than the old grey "Cambios guardados." text.
 */
export function SavedIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-1 text-xs font-medium text-success"
    >
      <CheckIcon className="h-3.5 w-3.5" />
      Guardado
    </span>
  );
}
