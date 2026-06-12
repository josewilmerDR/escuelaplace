/**
 * Typed reads of the `users` collection and the pages a user administers.
 *
 * "Pages" model (Facebook-style): a user account administers one or more pages
 * (businesses and/or schools), listed in `users/{uid}.managedPages`. These reads back
 * the private panel, so they run authenticated (the user reads their own doc).
 */
import { doc, getDoc } from "firebase/firestore";
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

/** A user by uid. Returns null if the doc does not exist. */
export async function getUserById(uid: string): Promise<UserDoc | null> {
  return docToTyped<User>(await getDoc(doc(db, USERS, uid)));
}

/**
 * A managed page resolved to its document. `role` is the user's role on that page;
 * `doc` is null if the referenced page no longer exists (stale entry in managedPages).
 */
export type ResolvedPage =
  | { type: "business"; role: ManagedPage["role"]; doc: BusinessDoc | null }
  | { type: "school"; role: ManagedPage["role"]; doc: SchoolDoc | null };

/**
 * The pages (businesses and/or schools) the user administers, resolved to their docs.
 * Used by the panel to list what the user can edit. Reads the user doc, then fetches
 * each referenced page in parallel.
 */
export async function getPagesByUser(uid: string): Promise<ResolvedPage[]> {
  const user = await getUserById(uid);
  if (!user) return [];

  return Promise.all(
    user.managedPages.map(async (page): Promise<ResolvedPage> => {
      // Explicit mapping: naive pluralization ("business" + "s") produced "businesss",
      // a collection no rule matches — every business page denied and the panel hung.
      const collectionName = page.type === "business" ? "businesses" : "schools";
      const snap = await getDoc(doc(db, collectionName, page.id));
      if (page.type === "business") {
        return { type: "business", role: page.role, doc: docToTyped<Business>(snap) };
      }
      return { type: "school", role: page.role, doc: docToTyped<School>(snap) };
    }),
  );
}
