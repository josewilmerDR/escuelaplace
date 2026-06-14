/**
 * Reads of the `auditEvents` collection — the append-only confirmation audit trail the
 * Cloud Function writes (see functions/src/index.ts `recordSubscriptionAudit` /
 * `recordContributionAudit`). The docs are NON-SENSITIVE by construction (who/when +
 * collusion signals, never the proof or a money figure). ADMIN-ONLY: firestore.rules reject
 * these reads for everyone else, so call them from the admin panel with an admin session.
 * They back fraud pattern-review and the planned risk-scoring feature store. No writes here
 * — only the Cloud Function appends events.
 */
import {
  collection,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AuditEvent, AuditEventDoc } from "@/types";
import { snapToList } from "./converters";

const AUDIT_EVENTS = "auditEvents";

/**
 * The strongest collusion flag on an audit event, or null when clean. `self_confirm` (the
 * confirming uid also runs the supporter side) outranks `self_deal` (they merely share an
 * administrator). Pure — drives the admin review highlighting.
 */
export function auditCollusionFlag(
  ev: Pick<AuditEvent, "confirmerIsSupporter" | "selfDealt">,
): "self_confirm" | "self_deal" | null {
  if (ev.confirmerIsSupporter) return "self_confirm";
  if (ev.selfDealt) return "self_deal";
  return null;
}

/** Most recent audit events across the platform (admin overview), newest first. */
export async function getRecentAuditEvents(max = 50): Promise<AuditEventDoc[]> {
  const q = query(
    collection(db, AUDIT_EVENTS),
    orderBy("createdAt", "desc"),
    fbLimit(max),
  );
  return snapToList<AuditEvent>(await getDocs(q));
}

/**
 * Audit events targeting one school, newest first — the per-school fraud-investigation view
 * (e.g. is this school confirming many supports for a co-administered business?). Filters by
 * equality and sorts in JS to avoid a composite index, the same approach as subscriptions.ts.
 */
export async function getAuditEventsBySchool(
  schoolId: string,
): Promise<AuditEventDoc[]> {
  const q = query(
    collection(db, AUDIT_EVENTS),
    where("schoolId", "==", schoolId),
  );
  return snapToList<AuditEvent>(await getDocs(q)).sort(
    (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
}
