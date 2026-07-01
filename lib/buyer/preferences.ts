"use client";

/**
 * Buyer ("person") preferences. The buyer has NO account and NO Firestore document: their
 * chosen school and location live ONLY in localStorage (see CLAUDE.md). This module is the
 * single read/write point for that client-side state, used to personalize the feed ranking.
 *
 * Reads go through `useSyncExternalStore` so SSR yields an empty snapshot (no hydration
 * mismatch) and same-tab writes re-render subscribers (the native `storage` event only
 * fires in OTHER tabs, so writes also dispatch a custom event).
 */
import { useCallback, useSyncExternalStore } from "react";
import { getCurrentCommunity } from "@/lib/community";
import type { BuyerPreferences } from "@/types";

// Namespaced by community id so two communities sharing a browser (e.g. escuelaplace.com and
// iglesiaplace.com behind the same CDN) never clobber each other's buyer state. For escuelaplace
// (id "escuelaplace") this resolves to the historical "escuelaplace.buyer", so existing devices
// keep their stored community — no orphaned localStorage.
const STORAGE_KEY = `${getCurrentCommunity().id}.buyer`;
const CHANGE_EVENT = `${STORAGE_KEY}.change`;
const EMPTY: BuyerPreferences = {};

// Cache so getSnapshot returns a stable reference while the raw string is unchanged
// (useSyncExternalStore loops forever if getSnapshot returns a new object every call).
let cache: { raw: string | null; value: BuyerPreferences } = {
  raw: null,
  value: EMPTY,
};

/** Read preferences from localStorage. Returns {} on the server or if absent/corrupt. */
export function readBuyerPreferences(): BuyerPreferences {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cache.raw) return cache.value;
  let value: BuyerPreferences = EMPTY;
  try {
    if (raw) value = JSON.parse(raw) as BuyerPreferences;
  } catch {
    value = EMPTY;
  }
  cache = { raw, value };
  return value;
}

/**
 * Forget everything stored about this device/buyer: chosen community, device key and applause
 * memory. The buyer has no account and no server-side data, so this is their complete "erasure" —
 * the localStorage counterpart of a registered user deleting their account.
 */
export function clearBuyerPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    cache = { raw: null, value: EMPTY };
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // storage disabled — nothing to clear, ignore.
  }
}

/** Persist preferences to localStorage and notify same-tab subscribers. */
export function writeBuyerPreferences(prefs: BuyerPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // storage full / disabled — preferences are best-effort, ignore.
  }
}

/**
 * The device's stable voter key, minting and persisting one on first use. The accountless pageant
 * voter sends this with an applause so the Cloud Function can dedup "one vote per device per
 * pageant". NOT an identity — a localStorage handle; clearing storage resets it (acceptable: App
 * Check is the real bot wall and the sympathy axis is capped + non-binding). Returns "" on the
 * server (the caller runs in the browser).
 */
export function ensureDeviceKey(): string {
  if (typeof window === "undefined") return "";
  const prefs = readBuyerPreferences();
  if (prefs.deviceKey) return prefs.deviceKey;
  const deviceKey = crypto.randomUUID();
  writeBuyerPreferences({ ...prefs, deviceKey });
  return deviceKey;
}

/** Remember that this device applauded `candidateId` in reinado `toolId`, so the button can show
 * "ya aplaudiste" without a server read. Merges into the existing map (read-merge-write). */
export function recordPageantApplause(toolId: string, candidateId: string): void {
  const prefs = readBuyerPreferences();
  writeBuyerPreferences({
    ...prefs,
    pageantApplause: { ...prefs.pageantApplause, [toolId]: candidateId },
  });
}

/** Which candidate this device already applauded in reinado `toolId`, or undefined. Pure read. */
export function applaudedCandidateId(
  prefs: BuyerPreferences,
  toolId: string,
): string | undefined {
  return prefs.pageantApplause?.[toolId];
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Hook over buyer preferences. `ready` is false during SSR/first paint and true once
 * mounted on the client, so callers can defer "no community" UI until localStorage is read.
 */
export function useBuyerPreferences() {
  const prefs = useSyncExternalStore(
    subscribe,
    readBuyerPreferences,
    () => EMPTY,
  );
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const update = useCallback((next: BuyerPreferences) => {
    writeBuyerPreferences(next);
  }, []);

  return { prefs, ready, update };
}
