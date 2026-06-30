"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Reusable accessible confirmation modal. Centralizes the destructive confirm that used to be
 * scattered across pages as `window.confirm` — so it can carry impact detail, match the design
 * tokens, and be keyboard/screen-reader friendly. The caller owns `open` and the busy state.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  busy = false,
  busyLabel,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** Body with the impact detail of what's about to happen. */
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  busyLabel?: string;
  /** Keep the confirm button disabled until a guard is met (e.g. a typed-to-confirm gate on an
   * irreversible action). Distinct from `busy`: it shows no busy label, just blocks the action. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // ESC closes (innermost handler), and on open move focus to Cancel and trap Tab inside.
  useEffect(() => {
    if (!open) return;
    // Remember what was focused (the trigger) so we can return focus there on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      // Simple focus trap: cycle Tab within the dialog's focusable elements.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Restore focus to the trigger so keyboard/SR users land back where they were,
      // instead of at the top of <body> when the dialog unmounts (WCAG 2.4.3).
      previouslyFocused?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5"
        // Clicks inside the card must not bubble to the overlay's onCancel.
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          className="text-base font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              tone === "destructive" ? "btn btn-destructive" : "btn btn-primary"
            }
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
