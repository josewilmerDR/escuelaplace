/**
 * Fire-and-forget event reporting for public business profiles. Events go to the
 * trackInteraction Cloud Function — anonymous buyers can't (and shouldn't) write
 * Firestore directly.
 *
 * sendBeacon over fetch: a contact click immediately navigates away (WhatsApp, the
 * dialer, Maps), and a beacon survives the page unload where a fetch may be cancelled.
 * Tracking is best-effort by design: with the endpoint unconfigured or the beacon
 * failing, the button must still work — attribution itself (prefilled message, UTM)
 * does not depend on counters.
 */
import type { BusinessEvent } from "@/types";

const endpoint = process.env.NEXT_PUBLIC_TRACK_INTERACTION_URL;

export function trackBusinessEvent(
  businessId: string,
  event: BusinessEvent,
): void {
  if (!endpoint) return;
  const body = JSON.stringify({ businessId, event });
  try {
    if (navigator.sendBeacon?.(endpoint, body)) return;
    // Beacon refused (queue full / very old browser): keepalive fetch as fallback.
    void fetch(endpoint, { method: "POST", body, keepalive: true }).catch(
      () => {},
    );
  } catch {
    // Never let tracking break the user's action.
  }
}
