/**
 * Client side of account / page deletion + data export. The write side lives in
 * functions/src/deletion.ts (Admin SDK callables) — the only safe place for the cascade: it
 * recomputes the denormalized signals the client can't, reaches other parties' private subdocs /
 * payment proofs, and deletes the Auth account. This module just invokes those callables.
 *
 * These back the Ley 8968 (ARCO) compliance surface: exportMyData = access, deletePage +
 * deleteAccount = cancelation.
 */
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";

/** Everything the platform holds about the signed-in user (incl. private names/amounts). */
export interface MyDataExport {
  exportedFor: string;
  account: Record<string, unknown> | null;
  donorProfile: Record<string, unknown> | null;
  subscriptions: unknown[];
  projectContributions: unknown[];
  pageantVotes: unknown[];
  raffleOrders: unknown[];
  productOrders: unknown[];
  bingoOrders: unknown[];
  reviews: unknown[];
  thankYous: unknown[];
  managedPages: unknown[];
}

/** Result of deleting the account: how the caller's pages were resolved. */
export interface DeleteAccountResult {
  ok: true;
  pagesDeleted: number;
  pagesTransferred: number;
  editorResigned: number;
}

/** Fetch the full export bundle (Ley 8968 access right). */
export async function exportMyData(): Promise<MyDataExport> {
  const call = httpsCallable<void, MyDataExport>(getFirebaseFunctions(), "exportMyData");
  return (await call()).data;
}

/**
 * Cascade-delete a whole page (business/school) the caller owns. Removes the page and all its
 * content, the support/orders that reference it, its Storage assets, and the managedPages links —
 * leaving the catalog's denormalized counters consistent. Irreversible.
 */
export async function deletePage(type: "business" | "school", id: string): Promise<void> {
  const call = httpsCallable<{ type: string; id: string }, { ok: true }>(
    getFirebaseFunctions(),
    "deletePage",
  );
  await call({ type, id });
}

/**
 * Delete the caller's whole account (Ley 8968 cancelation right). Hands off / deletes their pages,
 * anonymizes their personal support history (the anonymous money figure stays so schools'/projects'
 * totals remain honest; the identity is erased), removes their recognition + reviews, and deletes
 * the Auth account. Irreversible — call reauthenticate() right before this.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const call = httpsCallable<void, DeleteAccountResult>(getFirebaseFunctions(), "deleteAccount");
  return (await call()).data;
}
