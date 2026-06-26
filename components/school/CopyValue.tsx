"use client";

/**
 * Small "Copiar" button for a payment method value (account number, SINPE number, alias…), so the
 * supporter can copy it cleanly into their banking app instead of retyping it. Client island: the
 * clipboard needs the browser. Shows a brief "¡Copiado!" confirmation; on browsers/contexts where
 * the clipboard is blocked it simply does nothing (the value is still visible to copy by hand).
 */
import { useState } from "react";
import { CheckIcon, ClipboardIcon } from "@/components/ui/icons";

export function CopyValue({
  value,
  label,
  className = "",
}: {
  value: string;
  label?: string;
  /** Extra classes for placement (the caller positions the button; the base only styles it). */
  className?: string;
}) {
  // Brief "¡Copiado!" confirmation after a successful copy.
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the value stays on screen to copy manually.
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      // Stable accessible name: the visible text flips to "¡Copiado!" for sighted users, but screen
      // readers keep hearing "Copiar [label]" (so the just-activated control isn't relabelled) and
      // get the result from the live region below.
      aria-label={label ? `Copiar ${label}` : "Copiar"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-darker transition-colors hover:bg-brand-tint ${className}`}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
      <span aria-hidden="true">{copied ? "¡Copiado!" : "Copiar"}</span>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Valor copiado" : ""}
      </span>
    </button>
  );
}
