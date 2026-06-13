/**
 * Typed reads of the `users` collection and the pages a user administers.
 *
 * "Pages" model (Facebook-style): a user account administers one or more pages
 * (businesses and/or schools), listed in `users/{uid}.managedPages`. These reads back
 * the private panel, so they run authenticated (the user reads their own doc).
 */
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  updateDoc,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Business,
  BusinessDoc,
  ManagedPage,
  School,
  SchoolDoc,
  User,
  UserDoc,
} from "@/types";
import { docToTyped } from "./converters";

const USERS = "users";

/**
 * Queue the managedPages link (as owner) on the SAME batch as a page creation. If this
 * write ran separately and failed after the page doc existed, the page would be orphaned:
 * invisible in the panel, with a retry creating a duplicate. Used by createBusinessPage /
 * createSchoolPage.
 */
export function linkPageToUser(
  batch: WriteBatch,
  uid: string,
  type: "business" | "school",
  id: string,
): void {
  batch.update(doc(db, USERS, uid), {
    managedPages: arrayUnion({ type, id, role: "owner" }),
  });
}

/** A user by uid. Returns null if the doc does not exist. */
export async function getUserById(uid: string): Promise<UserDoc | null> {
  return docToTyped<User>(await getDoc(doc(db, USERS, uid)));
}

/**
 * A managed page resolved to its document. `id`/`role` come from the managedPages entry
 * (kept even when `doc` is null, so the panel can offer a "remove stale entry" action);
 * `doc` is null if the referenced page no longer exists or the read failed.
 */
export type ResolvedPage =
  | { type: "business"; id: string; role: ManagedPage["role"]; doc: BusinessDoc | null }
  | { type: "school"; id: string; role: ManagedPage["role"]; doc: SchoolDoc | null };

/**
 * Last resolved pages per uid, kept for the session. Enables stale-while-revalidate in the
 * panel: returning to /panel paints the previous list INSTANTLY (no loading skeleton) while
 * getPagesByUser refreshes it in the background — so switching between panel pages doesn't
 * flash a skeleton every time. Populated by getPagesByUser; read by getCachedPagesByUser.
 */
const pagesByUserCache = new Map<string, ResolvedPage[]>();

/**
 * The cached pages for a user, if any were resolved this session (else null). Synchronous,
 * for the panel's first render so it can paint the known list instead of a skeleton. The
 * data may be stale — getPagesByUser is still called to refresh it.
 */
export function getCachedPagesByUser(uid: string): ResolvedPage[] | null {
  return pagesByUserCache.get(uid) ?? null;
}

/**
 * The pages (businesses and/or schools) the user administers, resolved to their docs.
 * Used by the panel to list what the user can edit. Reads the user doc, then fetches
 * each referenced page in parallel. A single page's read failing (denied/offline) must
 * not nuke the whole list, so each fetch is isolated and degrades to `doc: null`.
 * The result is cached (see getCachedPagesByUser) for stale-while-revalidate.
 */
export async function getPagesByUser(uid: string): Promise<ResolvedPage[]> {
  const user = await getUserById(uid);
  if (!user) {
    pagesByUserCache.set(uid, []);
    return [];
  }

  const resolved = await Promise.all(
    user.managedPages.map(async (page): Promise<ResolvedPage> => {
      // Explicit mapping: naive pluralization ("business" + "s") produced "businesss",
      // a collection no rule matches — every business page denied and the panel hung.
      const collectionName = page.type === "business" ? "businesses" : "schools";
      try {
        const snap = await getDoc(doc(db, collectionName, page.id));
        if (page.type === "business") {
          return {
            type: "business",
            id: page.id,
            role: page.role,
            doc: docToTyped<Business>(snap),
          };
        }
        return {
          type: "school",
          id: page.id,
          role: page.role,
          doc: docToTyped<School>(snap),
        };
      } catch {
        // Degrade a single failed read to an "unavailable / no longer exists" card
        // instead of rejecting the whole Promise.all.
        return { type: page.type, id: page.id, role: page.role, doc: null };
      }
    }),
  );

  pagesByUserCache.set(uid, resolved);
  return resolved;
}

/**
 * Remove a managedPages entry from the user doc. Used to clean up stale entries (pages
 * that no longer exist) from the panel. `arrayRemove` matches the stored object exactly,
 * so it must be passed with only `{ type, id, role }` and no extra fields.
 */
export async function removeManagedPage(
  uid: string,
  page: ManagedPage,
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), {
    managedPages: arrayRemove({ type: page.type, id: page.id, role: page.role }),
  });
}
