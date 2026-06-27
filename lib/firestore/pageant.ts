/**
 * Typed reads + writes of a pageant ("Reinado") — its candidate roster and the pure helpers that
 * derive the SUGGESTED standings.
 *
 * The roster lives in the subcollection `schools/{schoolId}/tools/{toolId}/candidates/{candidateId}`
 * (the public tool doc stays light, holding only PageantConfig). READ is public — the public reinado
 * page renders the fichas; WRITE is the SCHOOL's alone (owner/editors/admin, enforced by
 * firestore.rules). The school owns name/bio/photo/order and the HUMAN `juryScore`; the four tally
 * fields (voteFree/voteSupport/supportCount/padrinoCount) are Cloud-Function-maintained — forced to 0
 * on create and frozen on update by the rules, so no client can inflate a candidate's standing. The
 * CFs that move those tallies arrive in a later slice; until then they read 0.
 *
 * The crown is the school's HUMAN verdict (written on the live-event doc, a later slice), never a
 * platform-computed outcome. `pageantStandings` only SUGGESTS a ranking from the four tallies + the
 * weights in PageantConfig.crownFormula; `effectiveWeights` drops the un-tamper-proof "simpatía" axis
 * when free voting is off. Both are pure and unit-tested. PURELY INFORMATIONAL — the platform never
 * processes money.
 */
import { cache } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Candidate,
  CandidateDoc,
  CandidateMediaItem,
  PageantConfig,
  PageantCrownFormula,
  PageantEventState,
  PageantPhase,
  PageantVote,
  PageantVoteDoc,
  ProjectCurrency,
} from "@/types";
import { snapToList } from "./converters";
import {
  confirmOrder,
  createOrder,
  deleteOrder,
  getOrderProofUrl,
  getOrdersBySchool,
  getOrdersByTool,
  uploadOrderProof,
  type OrderCollection,
} from "./orders";

const SCHOOLS = "schools";
const TOOLS = "tools";
const CANDIDATES = "candidates";
const EVENT = "event";
const STATE = "state";

function candidatesCol(schoolId: string, toolId: string) {
  return collection(db, SCHOOLS, schoolId, TOOLS, toolId, CANDIDATES);
}

function eventStateRef(schoolId: string, toolId: string) {
  return doc(db, SCHOOLS, schoolId, TOOLS, toolId, EVENT, STATE);
}

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────

/**
 * A candidate's presentation carousel as an ordered list, normalizing legacy docs. When `media` is
 * present (the source of truth) it's returned as-is; otherwise a legacy single `photoUrl` becomes a
 * one-image carousel; a candidate with neither yields an empty list. Pure — both the editor (to seed
 * its drafts) and the public card read through this so legacy and new docs render alike.
 */
export function candidateMediaOf(
  c: Pick<Candidate, "media" | "photoUrl">,
): CandidateMediaItem[] {
  if (c.media && c.media.length > 0) return c.media;
  if (c.photoUrl) return [{ type: "image", url: c.photoUrl }];
  return [];
}

/**
 * The avatar/cover URL for a candidate: the first IMAGE of its carousel, falling back to the legacy
 * `photoUrl` (a video-only candidate has no cover → undefined, so the card shows the placeholder).
 */
export function candidateCoverUrl(
  c: Pick<Candidate, "media" | "photoUrl">,
): string | undefined {
  return candidateMediaOf(c).find((m) => m.type === "image")?.url ?? c.photoUrl;
}

/**
 * The crown weights actually applied, given whether free voting is on. The three weights are
 * integers that SHOULD sum to 100. When free voting is OFF (e.g. App Check not yet proven in prod),
 * the "simpatía" axis is dropped — a non-tamper-proof count must never weigh on a real crown — and
 * the remaining jury/support weights are renormalized to sum to 100 again, so turning free voting
 * off never silently shrinks the score. When it's on, the weights pass through unchanged.
 */
export function effectiveWeights(
  config: Pick<PageantConfig, "crownFormula" | "freeVotingEnabled">,
): PageantCrownFormula {
  const f = config.crownFormula;
  if (!config.freeVotingEnabled) {
    // Guard /0 when both remaining weights are 0 (degenerate config) → no renormalization.
    const rest = f.jury + f.support || 1;
    return { jury: (f.jury / rest) * 100, support: (f.support / rest) * 100, sympathy: 0 };
  }
  return { jury: f.jury, support: f.support, sympathy: f.sympathy };
}

/** One candidate's suggested standing: the composite (0..100) and each axis's weighted part. */
export interface PageantStanding {
  candidateId: string;
  /** Weighted total, 0..100 (higher = better positioned). NON-BINDING — the school still crowns. */
  composite: number;
  /** Each axis's already-weighted contribution (0..its weight), for a transparent breakdown. */
  parts: { jury: number; support: number; sympathy: number };
}

/**
 * The SUGGESTED ranking — never the verdict. Normalizes each axis to its share of the roster's MAX
 * (the leader of an axis scores 1 on it), weights it, and sums; ties break to input order. The
 * tallies it reads (voteFree/voteSupport) are themselves Cloud-Function-maintained, so the suggestion
 * can't be inflated client-side. Returns one standing per candidate, highest composite first.
 */
export function pageantStandings(
  config: Pick<PageantConfig, "crownFormula" | "freeVotingEnabled">,
  candidates: Pick<
    CandidateDoc,
    "id" | "juryScore" | "voteSupport" | "voteFree"
  >[],
): PageantStanding[] {
  const w = effectiveWeights(config);
  // Math.max(1, …) avoids /0 when an axis is all-zero (then every candidate scores 0 on it) and when
  // the roster is empty (the spread is empty → Math.max(1) === 1).
  const maxJury = Math.max(1, ...candidates.map((c) => c.juryScore ?? 0));
  const maxSupport = Math.max(1, ...candidates.map((c) => c.voteSupport ?? 0));
  const maxFree = Math.max(1, ...candidates.map((c) => c.voteFree ?? 0));
  return candidates
    .map((c) => {
      const jury = w.jury * ((c.juryScore ?? 0) / maxJury);
      const support = w.support * ((c.voteSupport ?? 0) / maxSupport);
      const sympathy = w.sympathy * ((c.voteFree ?? 0) / maxFree);
      return {
        candidateId: c.id,
        composite: jury + support + sympathy,
        parts: { jury, support, sympathy },
      };
    })
    .sort((a, b) => b.composite - a.composite);
}

// ── Reads ───────────────────────────────────────────────────────────────────────

/** Candidates ordered by `order` (asc), then name as a stable tiebreak — the public roster order. */
function sortedCandidates(list: CandidateDoc[]): CandidateDoc[] {
  return list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * Every candidate of a reinado, ordered by `order` (ascending), then name as a stable tiebreak.
 * Public read. Wrapped in React cache() so the public detail page's metadata + body share one read.
 */
export const getCandidates = cache(
  async (schoolId: string, toolId: string): Promise<CandidateDoc[]> => {
    const snap = await getDocs(candidatesCol(schoolId, toolId));
    return sortedCandidates(snapToList<Candidate>(snap));
  },
);

/**
 * Subscribe to a reinado's candidate roster, ordered like getCandidates (by `order`, then `name`).
 * Calls `cb` immediately with the current list and again on every change; returns the unsubscribe fn
 * the caller MUST call on unmount. The live management console watches this so the suggested
 * standings refresh on their own as the Cloud Function moves the tallies (apoyo/simpatía confirmed).
 * Errors degrade to an empty list, mirroring subscribePageantEventState.
 */
export function subscribeCandidates(
  schoolId: string,
  toolId: string,
  cb: (candidates: CandidateDoc[]) => void,
): Unsubscribe {
  return onSnapshot(
    candidatesCol(schoolId, toolId),
    (snap) =>
      cb(sortedCandidates(snapToList<Candidate>(snap))),
    () => cb([]),
  );
}

// ── Writes (school owner/editor/admin only — enforced by rules) ──────────────────

/** New-candidate fields the school provides; the four tallies are forced to 0 (rules require it). */
export interface CreateCandidateInput {
  name: string;
  bio: string;
  /** Avatar cover (first image of `media`); already uploaded to the tool's asset path by now. */
  photoUrl?: string;
  /** Ordered carousel (≤5 images + ≤1 video); every URL already uploaded (uploadToolStageAsset). */
  media?: CandidateMediaItem[];
  order: number;
  /** The school's jury score, 0..100. */
  juryScore: number;
}

/**
 * Create one candidate, with the four Cloud-Function-maintained tallies forced to 0 (the rules
 * reject any other value on create). Returns the new candidate id. The media, if any, is already in
 * Storage — only its URLs are written here.
 */
export async function createCandidate(
  schoolId: string,
  toolId: string,
  input: CreateCandidateInput,
): Promise<string> {
  const ref = await addDoc(candidatesCol(schoolId, toolId), {
    name: input.name,
    bio: input.bio,
    ...(input.photoUrl ? { photoUrl: input.photoUrl } : {}),
    ...(input.media && input.media.length > 0 ? { media: input.media } : {}),
    order: input.order,
    juryScore: input.juryScore,
    voteFree: 0,
    voteSupport: 0,
    supportCount: 0,
    padrinoCount: 0,
  });
  return ref.id;
}

/** Fields a candidate update may touch — never the (fn) tallies (the rules freeze them anyway). */
export interface CandidatePatch {
  name?: string;
  bio?: string;
  /** A NEW cover URL (first image of `media`) to set; omit to keep the existing one. */
  photoUrl?: string;
  /** The new full carousel to set; omit to keep the existing one. An empty array clears it. */
  media?: CandidateMediaItem[];
  order?: number;
  juryScore?: number;
}

/**
 * Update a candidate's school-owned fields (name/bio/media/photo/order/juryScore). Omitted fields are
 * left untouched; the four (fn) tallies are never written here (and the rules reject them if they
 * were). `media` is written verbatim (already the full ordered list); `photoUrl` is its first image.
 */
export async function updateCandidate(
  schoolId: string,
  toolId: string,
  candidateId: string,
  patch: CandidatePatch,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId, CANDIDATES, candidateId), {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
    ...(patch.photoUrl !== undefined ? { photoUrl: patch.photoUrl } : {}),
    ...(patch.media !== undefined ? { media: patch.media } : {}),
    ...(patch.order !== undefined ? { order: patch.order } : {}),
    ...(patch.juryScore !== undefined ? { juryScore: patch.juryScore } : {}),
  });
}

/** Delete one candidate (roster management). */
export async function deleteCandidate(
  schoolId: string,
  toolId: string,
  candidateId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId, CANDIDATES, candidateId));
}

// ── Economic support ("apoyo") rail — pageantVotes ───────────────────────────────
//
// Thin typed wrappers over the shared informational-order skeleton (./orders): the pending create +
// the private name/amount split + the proof + the confirm-from-pending privacy model. What is
// pageant-SPECIFIC and lives here: the public candidateId/candidateName/units fields. PURELY
// INFORMATIONAL — the platform never processes the money; the supporter pays the school directly by
// the methods it publishes, and the school confirms the proof, same as donations. On confirmation a
// Cloud Function recomputes the candidate's voteSupport tally with the anti-fraud gate (later slice).

const PAGEANT_VOTES: OrderCollection = {
  name: "pageantVotes",
  proofPrefix: "pageant-vote-proofs",
};

/** Every support order of one reinado (any status), newest first. PUBLIC, anonymous-safe. Wrapped
 * in cache() to dedupe the detail page's reads in one request. */
export const getPageantVotesByTool = cache(
  (toolId: string): Promise<PageantVoteDoc[]> =>
    getOrdersByTool<PageantVote>(PAGEANT_VOTES, toolId),
);

/** Every support order targeting a school (any status), newest first — the board's queue. */
export const getPageantVotesBySchool = cache(
  (schoolId: string): Promise<PageantVoteDoc[]> =>
    getOrdersBySchool<PageantVote>(PAGEANT_VOTES, schoolId),
);

export interface CreatePageantVoteInput {
  schoolId: string;
  schoolName: string;
  toolId: string;
  toolTitle: string;
  candidateId: string;
  candidateName: string;
  buyerId: string;
  buyerName: string;
  /** Integer 1..PAGEANT_SUPPORT_UNITS_MAX. */
  units: number;
  /** units × pricePerSupportUnit, in `currency`. */
  amount: number;
  currency: ProjectCurrency;
}

/**
 * Create a `pending` support order. Must be called by the signed-in supporter (rules enforce
 * buyerId == auth.uid) and only against a verified school. The supporter's real name + amount go to
 * the private subdoc (off the public doc). Returns the new order id (for the proof upload).
 */
export function createPageantVote(input: CreatePageantVoteInput): Promise<string> {
  return createOrder(
    PAGEANT_VOTES,
    {
      schoolId: input.schoolId,
      schoolName: input.schoolName,
      toolId: input.toolId,
      toolTitle: input.toolTitle,
      candidateId: input.candidateId,
      candidateName: input.candidateName,
      buyerId: input.buyerId,
      units: input.units,
      currency: input.currency,
    },
    { buyerName: input.buyerName, amount: input.amount },
  );
}

export function uploadPageantVoteProof(voteId: string, file: Blob): Promise<void> {
  return uploadOrderProof(PAGEANT_VOTES, voteId, file);
}

/** Temporary download URL for the board to view a proof. null if missing/unauthorized. */
export function getPageantVoteProofUrl(voteId: string): Promise<string | null> {
  return getOrderProofUrl(PAGEANT_VOTES, voteId);
}

/**
 * Confirm a pending support order. School/admin only (rules). A Cloud Function then re-tallies the
 * candidate's voteSupport with the verified + no-self-dealing anti-fraud gate (later slice).
 */
export function confirmPageantVote(voteId: string, confirmedBy: string): Promise<void> {
  return confirmOrder(PAGEANT_VOTES, voteId, confirmedBy);
}

/** Delete a support order (the supporter cancels, or admin). */
export function deletePageantVote(voteId: string): Promise<void> {
  return deleteOrder(PAGEANT_VOTES, voteId);
}

// ── Live coronación — event/state ────────────────────────────────────────────────
//
// The reinado's live phase lives in the single doc schools/{schoolId}/tools/{toolId}/event/state —
// the SAME path + rule the bingo uses (public read so the virtual audience watches the gala in real
// time; only the school writes it). The director drives every transition by hand; the platform NEVER
// auto-crowns. `winnerCandidateId` is the school RATIFYING the SUGGESTED standings (pageantStandings),
// never a computed outcome. No money, no function-maintained fields — the school owns every write.

/**
 * Subscribe to a reinado's live-event state. Calls `cb` immediately with the current value (or null)
 * and again on every change; returns the unsubscribe fn the caller MUST call on unmount. The public
 * gala leaderboard and the director console both watch this live (cloned from subscribeBingoEventState).
 */
export function subscribePageantEventState(
  schoolId: string,
  toolId: string,
  cb: (state: PageantEventState | null) => void,
): Unsubscribe {
  return onSnapshot(
    eventStateRef(schoolId, toolId),
    (snap) => cb(snap.exists() ? (snap.data() as PageantEventState) : null),
    () => cb(null),
  );
}

/**
 * Move the reinado to a live phase (registration → voting → gala → closed). Upserts the single
 * event/state doc (merge), stamping `startedAt` only on the first write so the doc exists from phase 1
 * without clobbering the original start time. The platform never auto-advances — the director drives
 * every transition.
 */
export async function setPageantPhase(
  schoolId: string,
  toolId: string,
  phase: PageantPhase,
): Promise<void> {
  const ref = eventStateRef(schoolId, toolId);
  const prev = await getDoc(ref);
  await setDoc(
    ref,
    {
      phase,
      ...(prev.exists() ? {} : { startedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Reveal (or hide) the SUGGESTED standings publicly — the gala "reveal" moment. Upsert (merge). */
export async function revealPageantStandings(
  schoolId: string,
  toolId: string,
  revealed: boolean,
): Promise<void> {
  await setDoc(
    eventStateRef(schoolId, toolId),
    { revealed, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Record the school's HUMAN crown verdict: the winning candidate (+ an optional runner-up). The
 * platform NEVER auto-crowns — `pageantStandings` only suggests; THIS write is the school ratifying.
 * Pass null to un-crown. Caller passes both ids so setting one preserves the other (merge can't tell
 * "absent" from "clear"). Phase/reveal are separate controls (setPageantPhase / revealPageantStandings).
 */
export async function setPageantWinner(
  schoolId: string,
  toolId: string,
  winnerCandidateId: string | null,
  runnerUpCandidateId: string | null = null,
): Promise<void> {
  await setDoc(
    eventStateRef(schoolId, toolId),
    { winnerCandidateId, runnerUpCandidateId, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
