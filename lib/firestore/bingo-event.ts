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
  BingoActivePattern,
  BingoActivePrize,
  BingoClaim,
  BingoClaimDoc,
  BingoClaimStatus,
  BingoEventState,
} from "@/types";
import { BINGO_PAUSE_REASON_MAX } from "@/types";
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

// ── activePattern (de)serialization ─────────────────────────────────────────────
//
// Firestore rejects ARRAYS OF ARRAYS, and a pattern's `arrangements` is number[][]. These two
// helpers are the ONLY place that knows the wire shape: on the doc each arrangement rides as a
// `{ cells }` map (an array of maps is allowed); the rest of the app keeps using number[][]. The
// flat `preview` array needs no encoding.

function encodeActivePattern(p: BingoActivePattern): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    arrangements: p.arrangements.map((cells) => ({ cells })),
    preview: p.preview,
    ...(p.caption ? { caption: p.caption } : {}),
  };
}

function decodeActivePattern(raw: unknown): BingoActivePattern | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as {
    id?: string;
    name?: string;
    arrangements?: unknown;
    preview?: unknown;
    caption?: string;
  };
  const arrangements = Array.isArray(p.arrangements)
    ? p.arrangements.map((a) => {
        const cells = (a as { cells?: unknown })?.cells;
        return Array.isArray(cells) ? (cells as number[]) : [];
      })
    : [];
  return {
    id: p.id ?? "",
    name: p.name ?? "",
    arrangements,
    preview: Array.isArray(p.preview) ? (p.preview as number[]) : [],
    ...(p.caption ? { caption: p.caption } : {}),
  };
}

/** Decode a raw event-state doc into BingoEventState (turning the wire activePattern back into
 * number[][] arrangements). Legacy docs without activePattern decode to null. */
function decodeEventState(data: Record<string, unknown>): BingoEventState {
  return {
    ...(data as unknown as BingoEventState),
    activePattern: data.activePattern
      ? decodeActivePattern(data.activePattern)
      : null,
  };
}

// ── Event state: reads + live subscription ─────────────────────────────────────

/** One-shot read of the live-event state (null before the school first starts it). Public. */
export async function getBingoEventState(
  schoolId: string,
  toolId: string,
): Promise<BingoEventState | null> {
  const snap = await getDoc(eventStateRef(schoolId, toolId));
  return snap.exists() ? decodeEventState(snap.data()) : null;
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
    (snap) => cb(snap.exists() ? decodeEventState(snap.data()) : null),
    () => cb(null),
  );
}

// ── Event state: writes (school owner/editor/admin only — enforced by rules) ────

/**
 * Start (or restart) a round: status 'live', a clean board, the frozen `activePattern` snapshot
 * (the "cómo ganar"), the round's single `activePrize` (one prize per round, minor → major), and a
 * fresh `startedAt` that scopes the round. The director picks both in the picker BEFORE this fires.
 * `setDoc` REPLACES the doc, so a restart naturally clears the previous round's `winner`/`reviewing`
 * (set explicitly here for a clean shape).
 *
 * `resetPrizes` forces a brand-new bingo: the awarded-prizes ledger is wiped so every prize is
 * re-offered, even when the previous doc is still 'live'. The "Nueva partida" action uses it to go
 * straight from a running bingo to a fresh one without an intermediate 'closed' state.
 */
export async function startBingoEvent(
  schoolId: string,
  toolId: string,
  active: BingoActivePattern,
  prize: BingoActivePrize | null,
  resetPrizes = false,
): Promise<void> {
  const ref = eventStateRef(schoolId, toolId);
  // Carry forward which prizes were already won THIS bingo so the picker can skip them — but RESET
  // when starting a brand-new bingo: either the previous doc was 'closed' (that was the END of a
  // bingo) or the director explicitly asked for a new game (`resetPrizes`).
  const prev = await getDoc(ref);
  const awardedPrizes =
    !resetPrizes && prev.exists() && prev.data().status !== "closed"
      ? ((prev.data().awardedPrizes as string[] | undefined) ?? [])
      : [];
  await setDoc(ref, {
    status: "live",
    calledNumbers: [],
    activePattern: encodeActivePattern(active),
    // null for legacy bingos with no configured prizes (the round still runs, just unlabeled).
    activePrize: prize,
    reviewing: false,
    winner: null,
    pause: null,
    awardedPrizes,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Pause the live game (a refrigerio, a sorteo, etc.). Keeps `status: 'live'` — the round isn't lost,
 * players just see a "Bingo en pausa" notice. Both args are OPTIONAL: pass null for either. `minutes`
 * (when given) drives the public countdown from the server `startedAt`; once it elapses the notice
 * flips to "reiniciamos en cualquier momento". Idempotent re-pause just refreshes `startedAt`.
 */
export async function pauseBingoEvent(
  schoolId: string,
  toolId: string,
  minutes: number | null,
  reason: string | null,
): Promise<void> {
  const cleanReason = reason?.trim().slice(0, BINGO_PAUSE_REASON_MAX) || null;
  const cleanMinutes =
    minutes != null && Number.isFinite(minutes) && minutes > 0
      ? Math.round(minutes)
      : null;
  await updateDoc(eventStateRef(schoolId, toolId), {
    pause: {
      ...(cleanMinutes != null ? { minutes: cleanMinutes } : {}),
      ...(cleanReason ? { reason: cleanReason } : {}),
      startedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

/** Resume after a pause: clear the pause notice. The board/round are untouched (status stays live). */
export async function resumeBingoEvent(
  schoolId: string,
  toolId: string,
): Promise<void> {
  await updateDoc(eventStateRef(schoolId, toolId), {
    pause: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Flag/unflag that a current-round "¡Bingo!" is pending the school's review. The console
 * (owner/editor) writes this off the pending claims it already watches, so every PUBLIC watcher can
 * show "alguien cantó — revisando" without reading the private claims. Idempotent.
 */
export async function setBingoReviewing(
  schoolId: string,
  toolId: string,
  reviewing: boolean,
): Promise<void> {
  await updateDoc(eventStateRef(schoolId, toolId), {
    reviewing,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Confirm a round's winning claim AND announce it publicly — ATOMICALLY, in one transaction over the
 * claim doc + the event-state doc, so the two can never split (a confirmed claim with no public
 * winner would leave players marking a decided round forever). The public winner carries the CARTÓN
 * LABEL only, never a name. The prize is read from the event doc's AUTHORITATIVE `activePrize` (not a
 * stale client snapshot), and the claim is verified to belong to the CURRENT round (defends against a
 * mid-review restart). On the premio-mayor round (`activePrize.isGrand`) it also closes the whole
 * bingo and clears the round so the terminal doc reads cleanly. The school's human verdict (called ∩
 * cartón vs the round's pattern, shown in the queue) is the win check; this records that decision.
 */
export async function confirmBingoWinner(
  schoolId: string,
  toolId: string,
  claimId: string,
  confirmedBy: string,
): Promise<void> {
  const eventRef = eventStateRef(schoolId, toolId);
  const claimRef = doc(db, SCHOOLS, schoolId, TOOLS, toolId, CLAIMS, claimId);
  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const claimSnap = await tx.get(claimRef);
    if (!claimSnap.exists()) throw new Error("El reclamo ya no existe.");
    if (!eventSnap.exists()) throw new Error("La ronda no está activa.");
    const event = eventSnap.data();
    const claim = claimSnap.data();
    if (event.status !== "live") throw new Error("La ronda no está en vivo.");
    const startedMs =
      (event.startedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ??
      0;
    const claimMs =
      (claim.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ??
      0;
    // The claim must belong to the CURRENT round (a mid-review restart rolls startedAt forward).
    if (claimMs < startedMs) {
      throw new Error("La ronda cambió; el reclamo es de una ronda anterior.");
    }
    // The round's prize is read here from the doc — authoritative, never a stale client value.
    const prize =
      (event.activePrize as BingoActivePrize | null | undefined) ?? null;
    const prizeLabel = prize?.label ?? "";
    const isGrand = prize?.isGrand ?? false;
    tx.update(claimRef, {
      status: "confirmed",
      resolvedAt: serverTimestamp(),
      resolvedBy: confirmedBy,
    });
    tx.update(eventRef, {
      winner: { cardLabel: (claim.cardLabel as string) ?? "", prizeLabel, isGrand },
      reviewing: false,
      ...(prizeLabel ? { awardedPrizes: arrayUnion(prizeLabel) } : {}),
      ...(isGrand
        ? { status: "closed", closedAt: serverTimestamp(), activePrize: null }
        : {}),
      updatedAt: serverTimestamp(),
    });
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

/**
 * Subscribe to a player's own claims, oldest first (live). Returns the unsubscribe fn. Unlike the
 * one-shot read, this reflects the school's verdict (confirmed/rejected) the moment it lands, so the
 * play view can re-open the "¡Bingo!" button on a rejection and show "rechazado" without a reload.
 */
export function subscribeMyBingoClaims(
  schoolId: string,
  toolId: string,
  claimantId: string,
  cb: (claims: BingoClaimDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(claimsCol(schoolId, toolId), where("claimantId", "==", claimantId)),
    (snap) => cb(snapToList<BingoClaim>(snap).sort(byCreatedAtAsc)),
    (err) => onError?.(err),
  );
}

// ── Claims: writes ─────────────────────────────────────────────────────────────

export interface CreateBingoClaimInput {
  cardId: string;
  cardLabel: string;
  /** The round's pattern id + name, denormalized for the queue label. The win is re-validated by
   * the school against the event's authoritative activePattern, NOT a claim-carried geometry. */
  patternId: string;
  patternName: string;
  claimantId: string;
  claimantName: string;
}

/**
 * File a "¡Bingo!" claim. The caller must own the cartón (rules check card.ownerId == auth.uid).
 * Returns the new claim id. The claim starts 'pending'; the school re-validates the win against the
 * round's activePattern (called ∩ cartón) and confirms or rejects it.
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
    patternId: input.patternId,
    patternName: input.patternName,
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
