"use client";

import { useEffect } from "react";
import { CheckIcon } from "@/components/ui/icons";

/**
 * Transient "saved" confirmation shown next to a form's save button. A success-toned pill
 * with a check — far harder to miss than the old grey "Cambios guardados." text.
 *
 * The auto-clear timer lives here (not in each page) so it's cleaned up on unmount and can't
 * setState on a dead component. Contract: the page passes `show={saved}` and
 * `onHide={() => setSaved(false)}` — no per-page setTimeout needed. When `show` turns true a
 * timer fires `onHide()` after `autoHideMs`; it's cleared if the component unmounts or `show`
 * goes back to false.
 */
export function SavedIndicator({
  show,
  onHide,
  autoHideMs = 4000,
}: {
  show: boolean;
  onHide?: () => void;
  autoHideMs?: number;
}) {
  useEffect(() => {
    if (!show || !onHide) return;
    const id = window.setTimeout(onHide, autoHideMs);
    return () => window.clearTimeout(id);
  }, [show, onHide, autoHideMs]);

  if (!show) return null;
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-1 text-xs font-medium text-success ring-1 ring-success/10"
    >
      <CheckIcon className="h-3.5 w-3.5" />
      Guardado
    </span>
  );
}
