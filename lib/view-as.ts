"use client";

/**
 * "View as visitor" mode for the public business profile (FB's "View as"). A tiny
 * module-level store shared via useSyncExternalStore: the owner-only islands on the
 * page (ManageBar, ReviewForm, OwnReviewMark) are separate client subtrees, so a
 * context provider would have to live in the root layout just for this — module
 * state keeps it local to the feature. Only ManageBar (manager-only) ever turns it
 * on, and it shows the floating "exit" pill whenever it's on, so the mode is never
 * active invisibly.
 */
import { useSyncExternalStore } from "react";

let viewingAsVisitor = false;
const listeners = new Set<() => void>();

function setViewAsVisitor(value: boolean) {
  if (viewingAsVisitor === value) return;
  viewingAsVisitor = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current view-as state + setter. SSR snapshot is false: the server always renders
 * the real-visitor markup anyway, so there is nothing to hide pre-hydration. */
export function useViewAsVisitor(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => viewingAsVisitor,
    () => false,
  );
  return [value, setViewAsVisitor];
}
