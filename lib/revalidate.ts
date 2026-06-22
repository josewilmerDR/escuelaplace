"use server";

/**
 * On-demand revalidation of the statically-cached public pages.
 *
 * The catalog listings carry `export const revalidate = 300` and the detail pages are
 * statically generated, so without an explicit nudge a publish/edit stays invisible until
 * the ISR window lapses (or, for the detail pages, until the next deploy) — the home-feed
 * staleness incident. The panel's writes run with the Firestore CLIENT SDK, which cannot
 * call `revalidatePath`, so these server actions are the bridge: each write calls the
 * matching one after it commits, turning that lag into an immediate refresh.
 *
 * Security: every action revalidates a FIXED set of known routes — never a caller-supplied
 * path — so the most a caller can do is force a catalog regeneration, never invalidate an
 * arbitrary route. All callers treat these as best-effort (the write already committed), so
 * a revalidation failure must never surface as a mutation failure.
 *
 * NOTE: function-maintained signals (ranking.score, raised, reviewStats, metrics) change
 * from a Cloud Function the client can't await, so those are NOT covered here — the
 * `revalidate = 300` ISR window on the listings and detail pages picks them up instead.
 */

import { revalidatePath } from "next/cache";

/**
 * Pages that read the active-business set — the home feed, the search candidate pool, the
 * category index (counts) and every category listing — plus every business public page.
 * Called after a business is published/unpublished or its profile/gallery changes.
 *
 * The per-business detail pages are revalidated at the route level (all of them) because
 * the write functions only have the business id, not its slug; the catalog is small enough
 * that this is cheap, and regeneration is lazy (per page, on next request).
 */
export async function revalidateBusinessCatalog(): Promise<void> {
  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath("/categories");
  revalidatePath("/category/[id]", "page");
  revalidatePath("/business/[slug]", "layout");
}

/**
 * Pages that read schools — the home schools block and the schools directory — plus, when
 * `schoolId` is given, that school's own public pages (the `"layout"` scope covers the
 * profile index and its section sub-routes in one call). Called after a school is created
 * or its profile / payment methods / gallery change.
 */
export async function revalidateSchoolCatalog(schoolId?: string): Promise<void> {
  revalidatePath("/");
  revalidatePath("/schools");
  if (schoolId) revalidatePath(`/school/${schoolId}`, "layout");
}

/**
 * A school project's public surface: the school's pages (the project strip + the home's
 * active-project signal) and, when `projectId` is given, the project detail page. Called
 * after a project is created / edited / opened-closed / deleted.
 */
export async function revalidateProject(
  schoolId: string,
  projectId?: string,
): Promise<void> {
  revalidatePath("/");
  revalidatePath(`/school/${schoolId}`, "layout");
  if (projectId) revalidatePath(`/school/${schoolId}/project/${projectId}`);
}
