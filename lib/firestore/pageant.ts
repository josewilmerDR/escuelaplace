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
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Candidate,
  CandidateDoc,
  PageantConfig,
  PageantCrownFormula,
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
  orderProofPath,
  uploadOrderProof,
  type OrderCollection,
} from "./orders";

const SCHOOLS = "schools";
const TOOLS = "tools";
const CANDIDATES = "candidates";

function candidatesCol(schoolId: string, toolId: string) {
  return collection(db, SCHOOLS, schoolId, TOOLS, toolId, CANDIDATES);
}

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────

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

/**
 * Every candidate of a reinado, ordered by `order` (ascending), then name as a stable tiebreak.
 * Public read. Wrapped in React cache() so the public detail page's metadata + body share one read.
 */
export const getCandidates = cache(
  async (schoolId: string, toolId: string): Promise<CandidateDoc[]> => {
    const snap = await getDocs(candidatesCol(schoolId, toolId));
    return snapToList<Candidate>(snap).sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );
  },
);

// ── Writes (school owner/editor/admin only — enforced by rules) ──────────────────

/** New-candidate fields the school provides; the four tallies are forced to 0 (rules require it). */
export interface CreateCandidateInput {
  name: string;
  bio: string;
  /** Already uploaded to the tool's asset path (uploadToolStageAsset) by the time it reaches here. */
  photoUrl?: string;
  order: number;
  /** The school's jury score, 0..100. */
  juryScore: number;
}

/**
 * Create one candidate, with the four Cloud-Function-maintained tallies forced to 0 (the rules
 * reject any other value on create). Returns the new candidate id. The photo, if any, is already in
 * Storage — only its URL is written here.
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
  /** A NEW photo URL to set; omit to keep the existing one. */
  photoUrl?: string;
  order?: number;
  juryScore?: number;
}

/**
 * Update a candidate's school-owned fields (name/bio/photo/order/juryScore). Omitted fields are left
 * untouched; the four (fn) tallies are never written here (and the rules reject them if they were).
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

/** Storage path of a support order's payment proof (the file never appears in the public doc). */
export function pageantVoteProofPath(voteId: string): string {
  return orderProofPath(PAGEANT_VOTES, voteId);
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
