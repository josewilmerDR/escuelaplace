"use client";

import { useEffect } from "react";

/**
 * Native confirm-before-leave while a form holds unsaved work. Covers the worst data
 * losses (close tab, refresh, swipe-away on mobile); in-app navigations are NOT
 * intercepted — the App Router offers no route-change guard — so this is a backstop,
 * not a substitute for saving.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome ignores preventDefault unless returnValue is also set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
