"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { XMarkIcon } from "./icons";

/**
 * Generic accessible modal: overlay + centered card, ESC / click-outside to close, a focus
 * trap, and focus restore to the trigger on close. <ConfirmDialog> covers the fixed
 * confirm/cancel case; this is the open-ended one for forms and pickers. The caller owns
 * `open` and the body. Mirrors ConfirmDialog's a11y so the two behave identically.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // On open: remember the trigger, focus the first focusable, ESC closes, Tab cycles inside.
  useEffect(() => {
    if (!open) return;
    // Lock background scroll while the dialog is open so the page behind the overlay can't
    // scroll under the soft keyboard on mobile (and the scroll position is preserved).
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusablesOf = () =>
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
    focusablesOf()?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = focusablesOf();
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
      document.body.style.overflow = prevBodyOverflow;
      // Return focus to the trigger (WCAG 2.4.3) instead of the top of <body>.
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // On phones the dialog is a bottom sheet (items-end, flush to the bottom, rounded top only)
    // so it sits above the thumb and never collides with the soft keyboard; from sm up it's a
    // centered card. The card caps its height and scrolls internally so its actions stay
    // reachable, and pads the bottom safe-area inset on the flush mobile sheet.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-left shadow-lg ring-1 ring-black/5 sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-2xl sm:pb-6"
        // Clicks inside the card (and bubbling from the Combobox portal) must not reach the
        // overlay's onClose.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="text-base font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-m-1.5 shrink-0 rounded-full p-1.5 text-muted hover:bg-border/60 hover:text-foreground"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
