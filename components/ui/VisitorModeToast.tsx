"use client";

/**
 * Floating "you are viewing as a visitor" exit pill, shown by the public ManageBars
 * (business / school / project) while the owner is in "Ver como visitante" mode. The
 * owner-only UI collapses in that mode, so this is the only on-screen trace — the mode
 * can't get stuck on invisibly. Escape also exits, mirroring the lightbox overlay.
 *
 * Centralizes the pill (and its Escape handler) that used to be hand-copied across the
 * three ManageBars — a copied class string drifts, a component can't (design-language.md).
 * It reads the shared view-as store itself, so a manager only needs to render it.
 */
import { useEffect } from "react";
import { useViewAsVisitor } from "@/lib/view-as";

export function VisitorModeToast() {
  const [asVisitor, setAsVisitor] = useViewAsVisitor();

  useEffect(() => {
    if (!asVisitor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAsVisitor(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asVisitor, setAsVisitor]);

  if (!asVisitor) return null;

  return (
    // bg-slate-900: a neutral-dark surface the token scale has no equivalent for; kept here
    // in the single shared component instead of being re-pinned in each ManageBar.
    // On mobile it must clear the fixed BottomNav (4rem) plus the home-indicator inset and sit
    // above it (z-50); from sm up the bar is gone, so it drops back to bottom-4.
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 py-2 pl-4 pr-2 text-sm text-white shadow-lg sm:bottom-4">
      <span>Así ven tu página los visitantes</span>
      <button
        type="button"
        onClick={() => setAsVisitor(false)}
        className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25 active:bg-white/30"
      >
        Salir
      </button>
    </div>
  );
}
