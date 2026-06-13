/**
 * Typed reads of school projects (`schools/{schoolId}/projects/{projectId}`) and their
 * one-off contributions (top-level `projectContributions`). Public read, so these run from
 * server components (SSR — the project section and detail page) and from the panel.
 *
 * Like subscriptions, contribution status is filtered in JS (not in the query) to avoid
 * composite-index requirements; per-school/per-project result sets are small.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type {
  Project,
  ProjectContribution,
  ProjectContributionDoc,
  ProjectDoc,
  ProjectStage,
} from "@/types";
import { docToTyped, snapToList } from "./converters";

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

/** Sort by createdAt (desc) in JS to avoid a composite index with a where clause. */
function byCreatedAtDesc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/** All projects of a school (any status), newest first. */
export async function getProjectsBySchool(
  schoolId: string,
): Promise<ProjectDoc[]> {
  const snap = await getDocs(projectsCol(schoolId));
  return snapToList<Project>(snap).sort(byCreatedAtDesc);
}

/** A single project by ids. Returns null if it does not exist. */
export async function getProjectById(
  schoolId: string,
  projectId: string,
): Promise<ProjectDoc | null> {
  return docToTyped<Project>(
    await getDoc(doc(db, SCHOOLS, schoolId, PROJECTS, projectId)),
  );
}

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

/** All contributions targeting a school's projects (any status), newest first. */
export async function getContributionsBySchool(
  schoolId: string,
): Promise<ProjectContributionDoc[]> {
  const q = query(
    collection(db, PROJECT_CONTRIBUTIONS),
    where("schoolId", "==", schoolId),
  );
  return snapToList<ProjectContribution>(await getDocs(q)).sort(byCreatedAtDesc);
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

/** All contributions a user has made (any status), newest first. */
export async function getContributionsByDonor(
  donorId: string,
): Promise<ProjectContributionDoc[]> {
  const q = query(
    collection(db, PROJECT_CONTRIBUTIONS),
    where("donorId", "==", donorId),
  );
  return snapToList<ProjectContribution>(await getDocs(q)).sort(byCreatedAtDesc);
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
