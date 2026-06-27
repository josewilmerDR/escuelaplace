/**
 * Funnel-metric writes for business profiles.
 *
 * - trackInteraction: unauthenticated view/click counters from the PUBLIC profile.
 *   Buyers are anonymous and the rules (correctly) allow no unauthenticated writes to
 *   `businesses`, so the counters route through here — which keeps the rules closed
 *   and leaves room for App Check or per-IP rate limiting if abuse ever shows up.
 * - recordWalkIn: authenticated, manager-only counter of customers who mentioned
 *   escuelaplace at the counter. Only the business itself may record these — that
 *   exclusivity is what makes the number credible to its only consumer: the owner.
 *
 * Both feed the owner's PRIVATE funnel report, never the public ranking, so nobody
 * gains by gaming them — and the owner can audit the WhatsApp count against their own
 * chats.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { DOC_ID_RE, parseBeaconBody } from "./http";

/** Mirror of BusinessEvent in types/firestore.ts ("view" + ContactChannel). */
const TRACKED_EVENTS = new Set([
  "view",
  "whatsapp",
  "catalog",
  "phone",
  "directions",
  "website",
  "instagram",
  "facebook",
]);

/**
 * Day key for the metricsDaily series. Costa Rica has no DST, so a fixed UTC-6 offset
 * is correct year-round; keying by UTC would split local days at 18:00.
 */
function crDayKey(nowMs: number): string {
  return new Date(nowMs - 6 * 3_600_000).toISOString().slice(0, 10);
}

export const trackInteraction = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const parsed = parseBeaconBody(req);
  if (!parsed.ok) {
    res.status(400).end();
    return;
  }
  const { businessId, event } = (parsed.payload ?? {}) as {
    businessId?: unknown;
    event?: unknown;
  };

  if (
    typeof businessId !== "string" ||
    !DOC_ID_RE.test(businessId) ||
    typeof event !== "string" ||
    !TRACKED_EVENTS.has(event)
  ) {
    res.status(400).end();
    return;
  }

  const db = getFirestore();
  const businessRef = db.collection("businesses").doc(businessId);
  const dayRef = businessRef.collection("metricsDaily").doc(crDayKey(Date.now()));

  // Lifetime counters on the business doc + the daily series, atomically. updatedAt is
  // intentionally untouched: a metric tick is not a content edit.
  const one = FieldValue.increment(1);
  const batch = db.batch();
  if (event === "view") {
    batch.update(businessRef, { "metrics.views": one });
    batch.set(dayRef, { views: one }, { merge: true });
  } else {
    batch.update(businessRef, {
      "metrics.interactions": one,
      [`metrics.clicks.${event}`]: one,
    });
    batch.set(dayRef, { clicks: { [event]: one } }, { merge: true });
  }

  try {
    await batch.commit();
  } catch (err) {
    // Almost always an unknown businessId: batch.update requires the doc to exist,
    // which is also what keeps garbage ids from creating junk documents.
    logger.debug("trackInteraction dropped", { businessId, event, err });
    res.status(404).end();
    return;
  }

  res.status(204).end();
});

/**
 * Record (delta +1) or undo (delta -1) a walk-in customer who mentioned escuelaplace.
 * Only the business's owner/editors (or admin) may call: the count is the business's
 * own bookkeeping, so it must be impossible for anyone else to touch it. A transaction
 * keeps the daily count from going below zero (undo is only for same-day mis-taps).
 */
export const recordWalkIn = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const { businessId, delta } = (request.data ?? {}) as {
    businessId?: unknown;
    delta?: unknown;
  };
  if (
    typeof businessId !== "string" ||
    !DOC_ID_RE.test(businessId) ||
    (delta !== 1 && delta !== -1)
  ) {
    throw new HttpsError("invalid-argument", "Bad businessId or delta.");
  }

  const db = getFirestore();
  const businessRef = db.collection("businesses").doc(businessId);
  const day = crDayKey(Date.now());
  const dayRef = businessRef.collection("metricsDaily").doc(day);

  const walkIns = await db.runTransaction(async (tx) => {
    const [businessSnap, daySnap] = await Promise.all([
      tx.get(businessRef),
      tx.get(dayRef),
    ]);
    if (!businessSnap.exists) {
      throw new HttpsError("not-found", "Unknown business.");
    }

    let isManager =
      businessSnap.get("ownerId") === uid ||
      ((businessSnap.get("editorIds") as string[] | undefined) ?? []).includes(uid);
    if (!isManager) {
      // Reads must precede writes in a transaction; this conditional get still does.
      const userSnap = await tx.get(db.collection("users").doc(uid));
      isManager = userSnap.get("role") === "admin";
    }
    if (!isManager) {
      throw new HttpsError("permission-denied", "Not a manager of this business.");
    }

    const next = ((daySnap.get("walkIns") as number | undefined) ?? 0) + delta;
    if (next < 0) {
      throw new HttpsError("failed-precondition", "Nothing to undo today.");
    }

    tx.update(businessRef, { "metrics.walkIns": FieldValue.increment(delta) });
    tx.set(dayRef, { walkIns: next }, { merge: true });
    return next;
  });

  return { day, walkIns };
});
