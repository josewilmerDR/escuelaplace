import type { ReactNode } from "react";

/**
 * Sticky action bar for long panel forms. On a phone the only Guardar/Crear button sits at
 * the very bottom of a tall form, so the primary action is always offscreen while the user
 * fills it in. This pins the actions just above the fixed BottomNav (clearing the
 * home-indicator inset) with a hairline + blur, and collapses back to a plain inline row from
 * sm up — so desktop is visually unchanged (`sm:` resets every mobile-bar utility).
 *
 * It full-bleeds with `-mx-4` to match the panel shell's px-4 gutter. Place it as the last
 * child of the <form>; the caller owns the button(s) and their `w-full sm:w-auto` /
 * `flex-1 sm:flex-none` width so the bar can host a lone submit or a submit + SavedIndicator.
 */
export function StickyFormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 flex items-center gap-3 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      {children}
    </div>
  );
}
