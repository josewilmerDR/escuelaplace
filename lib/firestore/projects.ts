/**
 * Typed reads AND writes of school projects (`schools/{schoolId}/projects/{projectId}`)
 * and their one-off contributions (top-level `projectContributions`). Public read, so
 * reads run from server components (SSR — the project section and detail page) and the
 * panel; writes (board project CRUD + donor contributions) run client-side from the panel.
 *
 * A school lists concrete projects (e.g. "buy a water tank") with cost-justified stages.
 * Anyone managing the school drafts/edits them; `raised`/`contributorsCount` are
 * function-maintained from CONFIRMED contributions (the rules reject client writes to
 * them). The platform never touches the money — contributions record a relationship the
 * school confirms, exactly like subscriptions.
 *
 * Like subscriptions, contribution status is filtered in JS (not in the query) to avoid
 * composite-index requirements; per-school/per-project result sets are small.
 */
import { cache } from "react";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { safeExternalUrls } from "@/lib/url";
import type {
  Project,
  ProjectContribution,
  ProjectContributionDoc,
  ProjectContributionType,
  ProjectCurrency,
  ProjectDoc,
  ProjectStage,
  ProjectStatus,
  SchoolDoc,
} from "@/types";
import { docToTyped, snapToList } from "./converters";
import { isSchoolVerified } from "./schools";

const SCHOOLS = "schools";
const PROJECTS = "projects";
const PROJECT_CONTRIBUTIONS = "projectContributions";

/** Subcollection ref for a school's projects. */
function projectsCol(schoolId: string) {
  return collection(db, SCHOOLS, schoolId, PROJECTS);
}

/**
 * A project's funding goal: the sum of its stage costs. Computed, never stored — a stored
 * total could drift from the stages a contributor actually reads.
 */
export function projectGoal(
  stages: Pick<ProjectStage, "cost">[] | undefined,
): number {
  return (stages ?? []).reduce((sum, s) => sum + (s.cost || 0), 0);
}

/** Progress fraction in [0,1] (0 when the goal is 0, so the bar never divides by zero). */
export function projectProgress(
  raised: number,
  goal: number,
): number {
  if (goal <= 0) return 0;
  return Math.min(1, Math.max(0, raised / goal));
}

/** Whether the funded amount has met or exceeded the goal (false when the goal is 0). */
export function isGoalReached(raised: number, goal: number): boolean {
  return goal > 0 && raised >= goal;
}

/** Whether a project can currently accept contributions: its school is verified and the
 * project is still open. */
export function canFundProject(
  school: Pick<SchoolDoc, "verificationStatus">,
  project: Pick<ProjectDoc, "status">,
): boolean {
  return isSchoolVerified(school) && project.status === "active";
}

/** Sort by createdAt (desc) in JS to avoid a composite index with a where clause. */
function byCreatedAtDesc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/**
 * The ids of every school that has at least one project currently `active`. One
 * collection-group read across all `projects` subcollections (each project carries a
 * denormalized `schoolId`); status is filtered in JS — like the other project/contribution
 * reads — so no collection-group index is needed. Used by the public /schools directory to
 * badge schools that are crowdfunding something right now. Projects are public-read, so this
 * runs anonymously from the server component.
 */
export async function getSchoolIdsWithActiveProject(): Promise<Set<string>> {
  const snap = await getDocs(collectionGroup(db, PROJECTS));
  const ids = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data() as Project;
    if (data.status === "active") ids.add(data.schoolId);
  }
  return ids;
}

/**
 * All projects of a school (any status), newest first.
 *
 * Wrapped in React cache(): the public school profile reads it from both the shared
 * layout (to decide tab visibility) and the "Proyectos" page during one request — the
 * cache dedupes that into a single Firestore read.
 */
export const getProjectsBySchool = cache(
  async (schoolId: string): Promise<ProjectDoc[]> => {
    const snap = await getDocs(projectsCol(schoolId));
    return snapToList<Project>(snap).sort(byCreatedAtDesc);
  },
);

/**
 * A single project by ids. Returns null if it does not exist.
 *
 * Wrapped in React cache(): the public project detail page's generateMetadata and the
 * page component both read the same project during one request — the cache dedupes that
 * into a single Firestore read (the Firestore SDK, unlike fetch, gets no deduping from
 * Next).
 */
export const getProjectById = cache(
  async (
    schoolId: string,
    projectId: string,
  ): Promise<ProjectDoc | null> => {
    return docToTyped<Project>(
      await getDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId)),
    );
  },
);

/** All contributions to a project (any status), newest first. */
export async function getContributionsByProject(
  projectId: string,
): Promise<ProjectContributionDoc[]> {
  const q = query(
    collection(db, PROJECT_CONTRIBUTIONS),
    where("projectId", "==", projectId),
  );
  return snapToList<ProjectContribution>(await getDocs(q)).sort(byCreatedAtDesc);
}

/**
 * Merge each contribution's PRIVATE fields (donorName + `amount`) back onto the doc — CLIENT-ONLY
 * and best-effort. Those fields live in a private subdoc, not the public doc (so anonymous
 * scrapers can't deanonymize nor read how much a person gave). The authorized viewers (the
 * school's confirmation panel, or the contributor on their own history) need them and CAN read
 * the subdoc; the anonymous SSR donor wall is NOT authorized and doesn't render them — so we skip
 * the merge on the server and swallow unauthorized reads on the client.
 */
async function mergeContributionPrivate(
  contributions: ProjectContributionDoc[],
): Promise<ProjectContributionDoc[]> {
  if (typeof window === "undefined") return contributions; // SSR: the wall doesn't need them
  await Promise.all(
    contributions.map(async (c) => {
      try {
        const data = (
          await getDoc(doc(db, PROJECT_CONTRIBUTIONS, c.id, "private", "data"))
        ).data();
        if (!data) return;
        if (typeof data.donorName === "string") c.donorName = data.donorName;
        if (typeof data.amount === "number") c.amount = data.amount;
      } catch {
        // Unauthorized (or missing) — leave the fields as-is.
      }
    }),
  );
  return contributions;
}

/**
 * All contributions targeting a school's projects (any status), newest first. On the client
 * (the school's confirmation panel) each contribution's private fields are merged back in; on
 * the server (the anonymous donor wall) they are not (see mergeContributionPrivate).
 */
export async function getContributionsBySchool(
  schoolId: string,
): Promise<ProjectContributionDoc[]> {
  const q = query(
    collection(db, PROJECT_CONTRIBUTIONS),
    where("schoolId", "==", schoolId),
  );
  const contributions = snapToList<ProjectContribution>(
    await getDocs(q),
  ).sort(byCreatedAtDesc);
  return mergeContributionPrivate(contributions);
}

/**
 * Pending contributions targeting a school — the queue the board confirms (it validates
 * that each payment proof matches what it received). Newest first.
 */
export async function getPendingContributionsBySchool(
  schoolId: string,
): Promise<ProjectContributionDoc[]> {
  return (await getContributionsBySchool(schoolId)).filter(
    (c) => c.status === "pending",
  );
}

/** All contributions a user has made (any status), newest first. The contributor's own history
 * shows the amount, so the private fields are merged back in (they're authorized to read them;
 * runs client-side from the panel). */
export async function getContributionsByDonor(
  donorId: string,
): Promise<ProjectContributionDoc[]> {
  const q = query(
    collection(db, PROJECT_CONTRIBUTIONS),
    where("donorId", "==", donorId),
  );
  const contributions = snapToList<ProjectContribution>(
    await getDocs(q),
  ).sort(byCreatedAtDesc);
  return mergeContributionPrivate(contributions);
}

/**
 * A donor's contributions to ONE project (any status), newest first. Two equality filters
 * need no composite index (sorting stays in JS, like the siblings above), so the funding
 * flow fetches only this project's history instead of the donor's whole record.
 */
export async function getContributionsByDonorForProject(
  donorId: string,
  projectId: string,
): Promise<ProjectContributionDoc[]> {
  const q = query(
    collection(db, PROJECT_CONTRIBUTIONS),
    where("donorId", "==", donorId),
    where("projectId", "==", projectId),
  );
  const contributions = snapToList<ProjectContribution>(
    await getDocs(q),
  ).sort(byCreatedAtDesc);
  return mergeContributionPrivate(contributions);
}

/** Private Storage path of a contribution's payment proof (gated by storage.rules). */
export function contributionProofPath(contributionId: string): string {
  return `project-contribution-proofs/${contributionId}/proof`;
}

/**
 * A temporary URL to view a contribution's payment proof, or null if there is none /
 * access is denied. Gated by storage.rules (contributor, target school, or admin), so it
 * is fetched on demand from the panel — never stored in the public doc.
 */
export async function getContributionProofUrl(
  contributionId: string,
): Promise<string | null> {
  try {
    return await getDownloadURL(
      storageRef(storage, contributionProofPath(contributionId)),
    );
  } catch {
    return null;
  }
}

// ── Writes (board project CRUD) ──────────────────────────────────────────────

export interface CreateProjectInput {
  title: string;
  description: string;
  currency: ProjectCurrency;
  /** Ordered stages (cost-justified). The goal is the sum of their costs. */
  stages: ProjectStage[];
}

/**
 * Strip any quote URL whose scheme isn't http(s) before a stage is persisted. quoteUrls are
 * Firebase Storage download URLs in the normal flow, but they ride raw inside the stages[]
 * array — which Firestore rules can't validate element-by-element — so this is the write-side
 * half of the defense against a smuggled javascript:/data: href (the render-side guard is
 * safeExternalUrls; see finding #15). Photos render through next/image (remotePatterns-gated),
 * so they're left untouched.
 */
function sanitizeStages(stages: ProjectStage[]): ProjectStage[] {
  return stages.map((stage) =>
    stage.quoteUrls
      ? { ...stage, quoteUrls: safeExternalUrls(stage.quoteUrls) }
      : stage,
  );
}

/**
 * Create an `active` project under a school. Must be called by the school owner/editor (the
 * rules enforce it). `raised`/`contributorsCount` start at 0 and are maintained by the
 * Cloud Function; `ownerId`/`schoolName` are denormalized from the school. Returns the id.
 */
export async function createProject(
  schoolId: string,
  schoolName: string,
  ownerId: string,
  input: CreateProjectInput,
): Promise<string> {
  const created = await addDoc(collection(db, SCHOOLS, schoolId, PROJECTS), {
    schoolId,
    schoolName,
    title: input.title,
    description: input.description,
    currency: input.currency,
    status: "active",
    stages: sanitizeStages(input.stages),
    raised: 0,
    contributorsCount: 0,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

/** Fields of a project the board may edit. `raised`/`contributorsCount`/`status` are
 * handled elsewhere (function-maintained / setProjectStatus). */
export type ProjectPatch = Partial<{
  title: string;
  description: string;
  currency: ProjectCurrency;
  stages: ProjectStage[];
  coverUrl: string;
}>;

/** Update a project's editable fields. Must be called by the school owner/editor. */
export async function updateProject(
  schoolId: string,
  projectId: string,
  patch: ProjectPatch,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId), {
    ...patch,
    // Override patch.stages with the scheme-sanitized copy when the patch carries stages.
    ...(patch.stages ? { stages: sanitizeStages(patch.stages) } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Open/close a project. Reaching the money goal never auto-closes it (buying the tank
 * still has to happen), so `completed` is always a manual board action — also the way an
 * accepted in-kind donation fulfils a project.
 */
export async function setProjectStatus(
  schoolId: string,
  projectId: string,
  status: ProjectStatus,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a project. Must be called by the school owner/editor. Past contributions are
 * left as-is (history); the function simply stops recomputing a missing project. */
export async function deleteProject(
  schoolId: string,
  projectId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId));
}

/**
 * Upload a project asset (the cover, a stage photo or a stage quote) to the public school
 * Storage namespace and return its URL. Unique timestamped path so files never overwrite.
 * The caller persists the URL via updateProject (cover) or by writing it into the stages
 * array. `kind` only shapes the path for readability.
 */
export async function uploadProjectAsset(
  schoolId: string,
  projectId: string,
  kind: "cover" | "photo" | "quote",
  file: Blob,
): Promise<string> {
  const ref = storageRef(
    storage,
    `schools/${schoolId}/projects/${projectId}/${kind}-${Date.now()}`,
  );
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

// ── Writes (donor contributions) ─────────────────────────────────────────────

export interface CreateContributionInput {
  schoolId: string;
  schoolName: string; // denormalized
  projectId: string;
  projectTitle: string; // denormalized
  currency: ProjectCurrency; // copied from the project
  donorId: string;
  donorName: string; // denormalized
  type: ProjectContributionType;
  /** Money: amount paid. In-kind: assessed value (cost of the stage covered, or a
   * fraction). Both feed the progress bar once confirmed. */
  amount: number;
  /** What is being donated, for in-kind contributions. */
  description?: string;
  /** Stage this contribution covers (index into the project's stages), if tied to one. */
  stageIndex?: number;
  /** Snapshot of that stage's title, for the confirmation queue. */
  stageTitle?: string;
}

/**
 * Create a `pending` contribution to a project. Must be called by the signed-in donor
 * (the rules enforce `donorId == auth.uid` and that the school is verified). The payment
 * proof / evidence is uploaded separately. Returns the new id.
 */
export async function createContribution(
  input: CreateContributionInput,
): Promise<string> {
  const created = await addDoc(collection(db, PROJECT_CONTRIBUTIONS), {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    type: input.type,
    donorId: input.donorId,
    currency: input.currency,
    // Conditional spread: Firestore rejects explicit `undefined`.
    ...(input.description ? { description: input.description } : {}),
    ...(input.stageIndex != null ? { stageIndex: input.stageIndex } : {}),
    ...(input.stageTitle ? { stageTitle: input.stageTitle } : {}),
    status: "pending",
    confirmedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // The contributor's real (proof-matching) name AND its `amount` live in a PRIVATE subdoc,
  // never the public doc — so an anonymous scraper of `projectContributions` can neither
  // deanonymize the donor nor read how much they gave. Readable only by the contributor, the
  // target school, or admin; the project's public `raised` is a Cloud Function aggregate over
  // THIS amount (firestore.rules freezes it once the school confirms).
  await setDoc(doc(db, PROJECT_CONTRIBUTIONS, created.id, "private", "data"), {
    donorName: input.donorName,
    amount: input.amount,
  });
  return created.id;
}

/**
 * Upload (or replace) the payment proof for a contribution. The file goes to the private
 * Storage path (gated by storage.rules to the contributor / school / admin); only the
 * non-sensitive `proofUploaded` flag is written to the public doc.
 */
export async function uploadContributionProof(
  contributionId: string,
  file: Blob,
): Promise<void> {
  await uploadBytes(
    storageRef(storage, contributionProofPath(contributionId)),
    file,
  );
  await updateDoc(doc(db, PROJECT_CONTRIBUTIONS, contributionId), {
    proofUploaded: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Confirm a contribution. Must be called by the school's board (owner/editors) or admin.
 * Stamps `confirmedAt`/`confirmedBy`; a Cloud Function then recomputes the project's
 * `raised`/`contributorsCount`. One-off, so there is no expiry to set (unlike a
 * subscription renewal).
 */
export async function confirmContribution(
  id: string,
  confirmedBy: string,
): Promise<void> {
  await updateDoc(doc(db, PROJECT_CONTRIBUTIONS, id), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy,
    updatedAt: serverTimestamp(),
  });
}
