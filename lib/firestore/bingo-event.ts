/**
 * The bingo LIVE EVENT (Phase 2): the called-numbers board and the players' "¡Bingo!" claims.
 *
 *   - State doc: schools/{schoolId}/tools/{toolId}/event/state — a single doc the school drives
 *     (start → call numbers → award patterns → close). Read is PUBLIC so virtual players watch the
 *     board in real time; only the school writes it.
 *   - Claims:    schools/{schoolId}/tools/{toolId}/claims/{claimId} — created by a cartón's OWNER
 *     when they complete an enabled pattern; resolved (confirmed/rejected) only by the school.
 *
 * This is the first place in the codebase that uses Firestore real-time (`onSnapshot`): the live
 * board and the claims queue must update without a manual reload. The one-shot getters exist for
 * the SSR/initial render; the `subscribe*` helpers return an unsubscribe fn for the live views.
 *
 * The system NEVER auto-declares a winner — it validates (anti-cheat, via @/lib/bingo-patterns)
 * and the school awards. No money, no function-maintained fields.
 */
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  BingoClaim,
  BingoClaimDoc,
  BingoClaimStatus,
  BingoEventState,
  BingoPattern,
} from "@/types";
import { snapToList } from "./converters";

const SCHOOLS = "schools";
const TOOLS = "tools";
const EVENT = "event";
const STATE = "state";
const CLAIMS = "claims";

function eventStateRef(schoolId: string, toolId: string) {
  return doc(db, SCHOOLS, schoolId, TOOLS, toolId, EVENT, STATE);
}
function claimsCol(schoolId: string, toolId: string) {
  return collection(db, SCHOOLS, schoolId, TOOLS, toolId, CLAIMS);
}

// ── Event state: reads + live subscription ─────────────────────────────────────

/** One-shot read of the live-event state (null before the school first starts it). Public. */
export async function getBingoEventState(
  schoolId: string,
  toolId: string,
): Promise<BingoEventState | null> {
  const snap = await getDoc(eventStateRef(schoolId, toolId));
  return snap.exists() ? (snap.data() as BingoEventState) : null;
}

/**
 * Subscribe to the live-event state. Calls `cb` immediately with the current value (or null) and
 * again on every change. Returns the unsubscribe fn — the caller MUST call it on unmount.
 */
export function subscribeBingoEventState(
  schoolId: string,
  toolId: string,
  cb: (state: BingoEventState | null) => void,
): Unsubscribe {
  return onSnapshot(
    eventStateRef(schoolId, toolId),
    (snap) => cb(snap.exists() ? (snap.data() as BingoEventState) : null),
    () => cb(null),
  );
}

// ── Event state: writes (school owner/editor/admin only — enforced by rules) ────

/** Start (or restart) the event: status 'live', a clean board, no awarded patterns yet. */
export async function startBingoEvent(
  schoolId: string,
  toolId: string,
): Promise<void> {
  await setDoc(eventStateRef(schoolId, toolId), {
    status: "live",
    calledNumbers: [],
    awardedPatterns: [],
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Append a called number to the board. Uses arrayUnion so a double-tap can't duplicate it (and
 * order is the order of first addition). Idempotent for an already-called number.
 */
export async function callBingoNumber(
  schoolId: string,
  toolId: string,
  n: number,
): Promise<void> {
  await updateDoc(eventStateRef(schoolId, toolId), {
    calledNumbers: arrayUnion(n),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Undo the LAST called number (a misdial). A transaction reads the current list and writes it back
 * without its tail, so concurrent calls can't drop the wrong one.
 */
export async function undoLastCalledNumber(
  schoolId: string,
  toolId: string,
): Promise<void> {
  const ref = eventStateRef(schoolId, toolId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const called = (snap.data().calledNumbers as number[]) ?? [];
    if (called.length === 0) return;
    tx.update(ref, {
      calledNumbers: called.slice(0, -1),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Mark a pattern as awarded (its prize has been won) — closes it for further claims in the UI. */
export async function awardBingoPattern(
  schoolId: string,
  toolId: string,
  pattern: BingoPattern,
): Promise<void> {
  await updateDoc(eventStateRef(schoolId, toolId), {
    awardedPatterns: arrayUnion(pattern),
    updatedAt: serverTimestamp(),
  });
}

/** Close the event (game over). Keeps the board for the record. */
export async function closeBingoEvent(
  schoolId: string,
  toolId: string,
): Promise<void> {
  await updateDoc(eventStateRef(schoolId, toolId), {
    status: "closed",
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ── Claims: reads + live subscription ──────────────────────────────────────────

function byCreatedAtAsc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
}

/**
 * Subscribe to all claims of a bingo, oldest first (the board's queue, live). Returns the
 * unsubscribe fn. Only the school/admin can read the full list (rules); a player reads their own.
 * A listener error is reported via `onError` (NOT collapsed to an empty list) — during a live game
 * an empty queue and a permission failure must look different, or the board silently misses winners.
 */
export function subscribeBingoClaims(
  schoolId: string,
  toolId: string,
  cb: (claims: BingoClaimDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    claimsCol(schoolId, toolId),
    (snap) => cb(snapToList<BingoClaim>(snap).sort(byCreatedAtAsc)),
    (err) => onError?.(err),
  );
}

/** One-shot read of the claims a player has filed for this bingo (their own). */
export async function getMyBingoClaims(
  schoolId: string,
  toolId: string,
  claimantId: string,
): Promise<BingoClaimDoc[]> {
  const snap = await getDocs(
    query(claimsCol(schoolId, toolId), where("claimantId", "==", claimantId)),
  );
  return snapToList<BingoClaim>(snap).sort(byCreatedAtAsc);
}

// ── Claims: writes ─────────────────────────────────────────────────────────────

export interface CreateBingoClaimInput {
  cardId: string;
  cardLabel: string;
  pattern: BingoPattern;
  claimantId: string;
  claimantName: string;
}

/**
 * File a "¡Bingo!" claim. The caller must own the cartón (rules check card.ownerId == auth.uid).
 * Returns the new claim id. The claim starts 'pending'; the school validates + resolves it.
 */
export async function createBingoClaim(
  schoolId: string,
  toolId: string,
  input: CreateBingoClaimInput,
): Promise<string> {
  const ref = doc(claimsCol(schoolId, toolId));
  await setDoc(ref, {
    cardId: input.cardId,
    cardLabel: input.cardLabel,
    pattern: input.pattern,
    claimantId: input.claimantId,
    claimantName: input.claimantName,
    status: "pending",
    resolvedAt: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Resolve a claim (school/admin): confirm the win or reject it. */
export async function resolveBingoClaim(
  schoolId: string,
  toolId: string,
  claimId: string,
  status: Extract<BingoClaimStatus, "confirmed" | "rejected">,
  resolvedBy: string,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId, CLAIMS, claimId), {
    status,
    resolvedAt: serverTimestamp(),
    resolvedBy,
  });
}
