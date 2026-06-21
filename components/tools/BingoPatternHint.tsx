"use client";

/**
 * The "cómo ganar esta ronda" hint, compact: the winning shape's NAME and one-line description as
 * text, beside a SMALL tappable thumbnail of the shape. The thumbnail carries an explicit enlarge
 * affordance (a ring plus an always-visible corner badge — not hover-only, so it reads on touch);
 * tapping it opens a modal that draws the shape large. This keeps the live player view short (the
 * full visual lives one tap away) while still naming and describing the shape inline.
 *
 * Client-only for the modal open/close state; the shape itself is the shared, SSR-safe
 * BingoPatternPreview, so the "how to win" aid can never drift from the anti-cheat geometry.
 */
import { useState } from "react";
import { BingoPatternPreview } from "@/components/tools/BingoPatternPreview";
import { Modal } from "@/components/ui/Modal";
import { ExpandIcon } from "@/components/ui/icons";
import type { BingoActivePattern } from "@/types";

export function BingoPatternHint({ pattern }: { pattern: BingoActivePattern }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-3">
      {/* Only the thumbnail is the trigger (the user taps "the preview"). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ampliar el patrón «${pattern.name}»`}
        className="group relative shrink-0 rounded-lg p-1.5 ring-1 ring-black/10 transition hover:ring-brand-darker focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-darker"
      >
        <BingoPatternPreview cells={pattern.preview} size="xs" ariaLabel={pattern.name} />
        {/* Enlarge affordance: a corner badge, always visible (so it works on touch, not just
            hover), that nudges up on hover/focus to reinforce "tap me". */}
        <span
          aria-hidden
          className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-darker text-white shadow ring-2 ring-white transition group-hover:scale-110 group-focus-visible:scale-110"
        >
          <ExpandIcon className="h-3 w-3" />
        </span>
      </button>

      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{pattern.name}</p>
        {pattern.caption && (
          <p className="mt-0.5 text-sm text-muted">{pattern.caption}</p>
        )}
      </div>

      <Modal open={open} title={pattern.name} onClose={() => setOpen(false)}>
        <div className="flex flex-col items-center gap-3">
          <BingoPatternPreview
            cells={pattern.preview}
            size="lg"
            ariaLabel={pattern.name}
          />
          {pattern.caption && (
            <p className="text-center text-sm text-muted">{pattern.caption}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
