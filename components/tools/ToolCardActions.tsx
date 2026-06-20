"use client";

/**
 * The two per-activity actions on a school feed card (ToolCard): "Consultar" opens a prefilled
 * WhatsApp chat (only when a number resolves — otherwise it's hidden, never a dead link), and
 * "Compartir" shares the activity through the Web Share sheet, falling back to copying the link
 * on browsers without it (most desktops).
 *
 * Client island: share/clipboard need the browser. It sits above the card's stretched link
 * (relative z-10 at the call site) so these buttons stay independently clickable.
 */
import { useState } from "react";
import { ShareIcon, WhatsAppIcon } from "@/components/ui/icons";

export function ToolCardActions({
  whatsappUrl,
  sharePath,
  shareTitle,
  shareText,
}: {
  /** wa.me deep link, or null when no dialable number resolved (then no "Consultar"). */
  whatsappUrl: string | null;
  /** App-relative path to the tool; turned into an absolute URL at click time. */
  sharePath: string;
  shareTitle: string;
  shareText: string;
}) {
  // Brief "¡Copiado!" confirmation after the copy-link fallback runs.
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const url = window.location.origin + sharePath;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url });
      } catch {
        // The user dismissed the share sheet (or it failed) — don't surprise them with a copy.
      }
      return;
    }
    // No native share: copy the link and confirm briefly.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — nothing more we can do.
    }
  };

  return (
    <div className="flex gap-2">
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          // WhatsApp-flavored green, darkened to emerald-700 for AA contrast (see globals.css).
          className="btn flex-1 justify-center bg-emerald-700 text-white hover:bg-emerald-800"
        >
          <WhatsAppIcon className="mr-1.5 h-4 w-4" />
          Consultar
        </a>
      )}
      <button
        type="button"
        onClick={onShare}
        // Stable accessible name: the visible text flips to "¡Copiado!" for sighted users, but
        // screen readers keep hearing "Compartir" (so the just-activated control isn't relabelled)
        // and get the result from the live region below instead.
        aria-label="Compartir"
        className="btn btn-outline flex-1 justify-center"
      >
        <ShareIcon className="mr-1.5 h-4 w-4" />
        <span aria-hidden="true">{copied ? "¡Copiado!" : "Compartir"}</span>
      </button>
      {/* The copy is the ONLY success signal on the desktop fallback path (native share returns
          silently), so announce it politely to screen readers. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Enlace copiado" : ""}
      </span>
    </div>
  );
}
