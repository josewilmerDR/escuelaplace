/**
 * Typed reads AND writes of school "Herramientas" (`schools/{schoolId}/tools/{toolId}`).
 * Public read, so reads run from server components (the public "Principal" section + the tool
 * detail page); writes (the board's tool CRUD) run client-side from the panel.
 *
 * A tool is a lightweight activity a school runs that doesn't warrant its own tab — a raffle,
 * a bingo, a sale, a service, a guided tour. The concrete kinds live in a registry
 * (lib/tools/registry); the storage shape here is the same for every kind. PURELY
 * INFORMATIONAL: like every other surface the platform never touches money — a tool may carry
 * an optional call-to-action LINK (scheme-checked on write), nothing more. No
 * function-maintained fields: the school owns every field (so, unlike projects, there are no
 * counters to preserve).
 */
import { cache } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { formatDate } from "@/lib/format";
import { safeExternalUrl } from "@/lib/url";
import type { Tool, ToolCta, ToolDoc, ToolStatus, ToolType } from "@/types";
import { docToTyped, snapToList } from "./converters";

const SCHOOLS = "schools";
const TOOLS = "tools";

/** Subcollection ref for a school's tools. */
function toolsCol(schoolId: string) {
  return collection(db, SCHOOLS, schoolId, TOOLS);
}

/** Sort by createdAt (desc) in JS to avoid a composite index (matches projects). */
function byCreatedAtDesc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/**
 * All tools of a school (any status), newest first.
 *
 * Wrapped in React cache(): the public school "Principal" section and (when present) other
 * server reads in the same request share a single Firestore read.
 */
export const getToolsBySchool = cache(
  async (schoolId: string): Promise<ToolDoc[]> => {
    const snap = await getDocs(toolsCol(schoolId));
    return snapToList<Tool>(snap).sort(byCreatedAtDesc);
  },
);

/**
 * A single tool by ids. Returns null if it does not exist.
 *
 * Wrapped in React cache(): the detail page's generateMetadata and the page component read
 * the same tool during one request — the cache dedupes that into a single Firestore read.
 */
export const getToolById = cache(
  async (schoolId: string, toolId: string): Promise<ToolDoc | null> => {
    return docToTyped<Tool>(await getDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId)));
  },
);

/** The tools a school shows publicly (status 'active'), newest first. */
export function publicTools(tools: ToolDoc[]): ToolDoc[] {
  return tools.filter((t) => t.status === "active");
}

/**
 * Human label for a tool's optional activity window: "15 jun 2026 – 20 jun 2026",
 * "Desde 15 jun 2026", "Hasta 20 jun 2026", or null when no dates are set.
 */
export function toolWindowLabel(
  tool: Pick<Tool, "startsAt" | "endsAt">,
): string | null {
  const s = tool.startsAt?.toMillis?.();
  const e = tool.endsAt?.toMillis?.();
  if (s && e) return `${formatDate(s)} – ${formatDate(e)}`;
  if (s) return `Desde ${formatDate(s)}`;
  if (e) return `Hasta ${formatDate(e)}`;
  return null;
}

// ── Date <-> <input type="date"> helpers (day-granular, UTC) ─────────────────
// A tool date is a calendar DAY, not an instant — it must read back as the same day for
// every viewer. So the round-trip is anchored at UTC midnight (store) and read with UTC
// getters (display), and toolWindowLabel formats in UTC too. Using LOCAL midnight would
// shift the stored day by the writer's offset and render a day off for readers east of UTC.

/** Firestore Timestamp → "YYYY-MM-DD" (UTC) for an `<input type="date">` value. */
export function toolDateInputValue(ts: Timestamp | undefined): string {
  if (!ts) return "";
  const d = ts.toDate();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/** "YYYY-MM-DD" → a UTC-midnight Date, or null when empty/invalid. */
export function toolDateFromInput(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

// ── Writes (board tool CRUD) ─────────────────────────────────────────────────

/**
 * Drop a CTA that isn't both labelled AND a safe http(s) URL. The scheme check (parse, not
 * regex) is what makes the stored link safe to render in an `<a href>` later — a
 * `javascript:`/`data:` value is rejected here (defense in depth with the render-side guard).
 */
function sanitizeCta(
  cta: { label: string; url: string } | null | undefined,
): ToolCta | null {
  if (!cta) return null;
  const label = cta.label.trim();
  const url = safeExternalUrl(cta.url);
  if (!label || !url) return null;
  return { label, url };
}

export interface CreateToolInput {
  type: ToolType;
  title: string;
  description: string;
  /** Defaults to 'active' (visible). */
  status?: ToolStatus;
}

/**
 * Create a tool, forced 'active' by default. Mirrors createProject: the cover, dates and CTA
 * are added on the edit page after creation (so the board lands there with the tool already
 * persisted). Returns the new id.
 */
export async function createTool(
  schoolId: string,
  schoolName: string,
  ownerId: string,
  input: CreateToolInput,
): Promise<string> {
  const created = await addDoc(toolsCol(schoolId), {
    schoolId,
    schoolName,
    type: input.type,
    title: input.title,
    description: input.description,
    status: input.status ?? "active",
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

export interface ToolPatch {
  type: ToolType;
  title: string;
  description: string;
  status: ToolStatus;
  /** A NEW cover URL to set; omit to keep the existing cover. */
  coverUrl?: string;
  /** Activity window — null clears the field. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** Call to action — null (or an unsafe/empty value) clears the field. */
  cta: { label: string; url: string } | null;
}

/**
 * Update a tool. Optional fields are set when present and DELETED when null (deleteField), so
 * clearing a date or the CTA in the form actually removes it from the doc. updatedAt is
 * always refreshed.
 */
export async function updateTool(
  schoolId: string,
  toolId: string,
  patch: ToolPatch,
): Promise<void> {
  const cta = sanitizeCta(patch.cta);
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    type: patch.type,
    title: patch.title,
    description: patch.description,
    status: patch.status,
    ...(patch.coverUrl ? { coverUrl: patch.coverUrl } : {}),
    startsAt: patch.startsAt ? Timestamp.fromDate(patch.startsAt) : deleteField(),
    endsAt: patch.endsAt ? Timestamp.fromDate(patch.endsAt) : deleteField(),
    cta: cta ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/** Toggle a tool's visibility (quick action from the list). */
export async function setToolStatus(
  schoolId: string,
  toolId: string,
  status: ToolStatus,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTool(
  schoolId: string,
  toolId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId));
}

/** Upload a tool cover image; returns its public download URL. Timestamped so it never
 * overwrites a previous cover. */
export async function uploadToolCover(
  schoolId: string,
  toolId: string,
  file: Blob,
): Promise<string> {
  const ref = storageRef(
    storage,
    `schools/${schoolId}/tools/${toolId}/cover-${Date.now()}`,
  );
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}
