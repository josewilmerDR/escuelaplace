"use client";

/**
 * Small copy-to-clipboard button. Copies `value` and flashes a brief "¡Copiado!"
 * confirmation. Lifts the friction of hand-copying a school's payment data (SINPE number,
 * bank account, etc.) on the support flows — the donor pastes it straight into their bank
 * app instead of memorizing it or writing it on paper.
 *
 * Client island: the clipboard needs the browser. The visible text/icon flips to the
 * confirmation for sighted users, but the accessible name stays stable ("Copiar <label>")
 * so a just-activated control isn't relabelled; the result is announced through the live
 * region instead. If the clipboard is blocked (insecure context / denied permission) the
 * click is a silent no-op.
 */
import { useEffect, useState } from "react";
import { CheckIcon, ClipboardIcon } from "@/components/ui/icons";

export function CopyButton({
  value,
  label,
  className = "",
}: {
  /** The exact text written to the clipboard. */
  value: string;
  /** What is being copied, woven into the accessible name (e.g. "SINPE Móvil"). */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  // Reset the confirmation after a beat; cleaned up on unmount so it can't fire on a dead node.
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context / permissions) — nothing more we can do.
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label ? `Copiar ${label}` : "Copiar"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand ${
        copied
          ? "text-success"
          : "text-brand-darker hover:bg-brand-tint"
      } ${className}`}
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5" />
      ) : (
        <ClipboardIcon className="h-3.5 w-3.5" />
      )}
      <span aria-hidden="true">{copied ? "¡Copiado!" : "Copiar"}</span>
      {/* The flash is the only success signal, so announce it politely to screen readers. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copiado" : ""}
      </span>
    </button>
  );
}
