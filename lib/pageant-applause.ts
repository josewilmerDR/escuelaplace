"use client";

/**
 * Client caller for the free "simpatía" applause of a pageant candidate — the accountless visitor's
 * only way to vote, since the applause ledger is closed to all clients (the count is maintained by a
 * Cloud Function). Mirrors lib/track.ts (fire to an HTTP function), hardened for a vote that weighs
 * on the crown:
 *
 * - It attaches a fresh **App Check** token (the bot wall). With App Check not configured yet, the
 *   token is null and the call is reported `unavailable` — the free-vote layer stays gated off until
 *   App Check is proven in prod (and `freeVotingEnabled` is flipped on per reinado).
 * - It sends the device's stable `voterKey` so the function can dedup "one vote per device per
 *   pageant". The server re-checks every gate (verified school, active pageant, freeVotingEnabled,
 *   window) — this caller is best-effort UI plumbing, never the source of truth.
 */
import { getAppCheckToken } from "@/lib/firebase";
import { ensureDeviceKey } from "@/lib/buyer/preferences";

const endpoint = process.env.NEXT_PUBLIC_CAST_APPLAUSE_URL;

export interface CastApplauseInput {
  schoolId: string;
  toolId: string;
  candidateId: string;
}

/**
 * The outcome of an applause attempt, for the button's feedback:
 * - `ok`        — counted (a fresh ballot).
 * - `duplicate` — this device already applauded in this pageant (no double count); treat as done.
 * - `unavailable` — App Check / the endpoint isn't configured, or a gate rejected it; nothing counted.
 * - `error`     — a transient network/server failure; the user may retry.
 */
export type ApplauseResult = "ok" | "duplicate" | "unavailable" | "error";

export async function castPageantApplause(
  input: CastApplauseInput,
): Promise<ApplauseResult> {
  if (!endpoint) return "unavailable";
  const token = await getAppCheckToken();
  if (!token) return "unavailable";
  const voterKey = ensureDeviceKey();
  if (!voterKey) return "unavailable";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-AppCheck": token,
      },
      body: JSON.stringify({ ...input, voterKey }),
    });
    if (res.status === 204) return "ok";
    if (res.status === 409) return "duplicate"; // already applauded from this device
    if (res.status === 403 || res.status === 401) return "unavailable"; // a gate rejected it
    return "error";
  } catch {
    return "error";
  }
}
