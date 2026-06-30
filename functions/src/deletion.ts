/**
 * Account / page deletion + data export (Gen 2, Admin SDK) — the Ley 8968 (ARCO) compliance surface.
 *
 * - exportMyData  (onCall): the ACCESS right. Assembles everything the platform holds about the
 *   caller — including the private subdocs (names, amounts) the client can't read — into one JSON.
 * - deletePage    (onCall): cascade-delete a whole business/school the caller OWNS (editors can't).
 * - deleteAccount (onCall): the CANCELLATION right. Hands off / cascade-deletes the caller's pages,
 *   anonymizes their personal support records (keep the anonymous figure, erase the identity),
 *   deletes their recognition + reviews + user doc, and finally deletes the Auth account.
 * - onToolDeleted (trigger): the cleanup the existing per-tool client delete never did — so deleting
 *   a tool (directly, or as part of a school purge) stops orphaning its subcollections / orders /
 *   Storage. The cascade callables reuse the same engine (cascade.ts).
 *
 * Every privileged action is appended to the admin-only, append-only `deletionEvents` trail, so an
 * erasure is itself provable (compliance) and reviewable (fraud).
 *
 * Why callables and not a client cascade: the client SDK can't recompute the denormalized signals
 * (decision #5), can't touch other parties' private subdocs / the closed `applause` ledger /
 * payment proofs, and can't delete the Auth account. All of that lives in cascade.ts, run here.
 */
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  anonymizeDonorRecords,
  inChunks,
  purgeBusiness,
  purgeSchool,
  purgeTool,
} from "./cascade";

const db = getFirestore();

const USERS = "users";
const DONOR_PROFILES = "donorProfiles";
const THANK_YOUS = "thankYous";
const DELETION_EVENTS = "deletionEvents";
const REVIEWS = "reviews";

/** Firestore doc-id charset (pages, tools). Auth uids are alphanumeric. */
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

type PageType = "business" | "school";
const pageCollection = (type: PageType) => (type === "business" ? "businesses" : "schools");

/** The signed-in caller's uid, or a clean unauthenticated error. */
function requireCaller(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  return request.auth.uid;
}

// ── onToolDeleted ───────────────────────────────────────────────────────────
// A tool deletion (the existing client delete, or a tool doc removed by a school purge's
// recursiveDelete) fires this. It runs the tool cleanup the client never could — its subcollections,
// Storage tree, and top-level orders/votes. Idempotent, so a school purge re-firing it is harmless.
export const onToolDeleted = onDocumentDeleted(
  "schools/{schoolId}/tools/{toolId}",
  async (event) => {
    const { schoolId, toolId } = event.params;
    await purgeTool(schoolId, toolId);
  },
);

// ── exportMyData ──────────────────────────────────────────────────────────────
/** A query's docs, each merged with its private subdoc (name + amount) — included because this is
 * the data subject's OWN data. */
async function withPrivate(
  collection: string,
  field: "donorId" | "buyerId",
  uid: string,
): Promise<unknown[]> {
  const snap = await db.collection(collection).where(field, "==", uid).get();
  return Promise.all(
    snap.docs.map(async (d) => ({
      id: d.id,
      ...d.data(),
      private: (await d.ref.collection("private").doc("data").get()).data() ?? null,
    })),
  );
}

export const exportMyData = onCall(async (request) => {
  const uid = requireCaller(request);

  const [userSnap, profileSnap, reviews, thanks] = await Promise.all([
    db.collection(USERS).doc(uid).get(),
    db.collection(DONOR_PROFILES).doc(uid).get(),
    db.collectionGroup(REVIEWS).where("authorId", "==", uid).get(),
    db.collection(THANK_YOUS).where("donorId", "==", uid).get(),
  ]);

  const [subscriptions, projectContributions, pageantVotes, raffleOrders, productOrders, bingoOrders] =
    await Promise.all([
      withPrivate("subscriptions", "donorId", uid),
      withPrivate("projectContributions", "donorId", uid),
      withPrivate("pageantVotes", "buyerId", uid),
      withPrivate("raffleOrders", "buyerId", uid),
      withPrivate("productOrders", "buyerId", uid),
      withPrivate("bingoOrders", "buyerId", uid),
    ]);

  // The pages the caller administers, with the school payment methods they can see as owner/editor.
  const managed = (userSnap.get("managedPages") as { type?: PageType; id?: string }[] | undefined) ?? [];
  const managedPages = await Promise.all(
    managed
      .filter((p) => (p.type === "business" || p.type === "school") && typeof p.id === "string")
      .map(async (p) => {
        const ref = db.collection(pageCollection(p.type as PageType)).doc(p.id as string);
        const doc = await ref.get();
        const out: Record<string, unknown> = { type: p.type, id: p.id, data: doc.data() ?? null };
        if (p.type === "school") {
          out.paymentMethods = (await ref.collection("private").doc("data").get()).data() ?? null;
        }
        return out;
      }),
  );

  return {
    exportedFor: uid,
    account: userSnap.data() ?? null,
    donorProfile: profileSnap.data() ?? null,
    subscriptions,
    projectContributions,
    pageantVotes,
    raffleOrders,
    productOrders,
    bingoOrders,
    reviews: reviews.docs.map((d) => ({ id: d.id, path: d.ref.path, ...d.data() })),
    thankYous: thanks.docs.map((d) => ({ id: d.id, ...d.data() })),
    managedPages,
  };
});

// ── deletePage ────────────────────────────────────────────────────────────────
export const deletePage = onCall(async (request) => {
  const uid = requireCaller(request);
  const data = request.data as { type?: unknown; id?: unknown } | null | undefined;
  const type = data?.type;
  const id = data?.id;
  if ((type !== "business" && type !== "school") || typeof id !== "string" || !ID_RE.test(id)) {
    throw new HttpsError("invalid-argument", "Página inválida.");
  }
  const isAdmin = request.auth?.token.admin === true;

  const ref = db.collection(pageCollection(type)).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, alreadyGone: true };
  // A whole page is the OWNER's to delete (or an admin's) — editors manage content, not existence.
  if (!isAdmin && snap.get("ownerId") !== uid) {
    throw new HttpsError("permission-denied", "Solo el dueño de la página puede eliminarla.");
  }

  if (type === "business") await purgeBusiness(id);
  else await purgeSchool(id);

  await db.collection(DELETION_EVENTS).add({
    type: "page_deleted",
    pageType: type,
    pageId: id,
    pageName: (snap.get("name") as string | undefined) ?? "",
    actorUid: uid,
    byAdmin: isAdmin && snap.get("ownerId") !== uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ── deleteAccount ───────────────────────────────────────────────────────────────
/** Promote a co-editor to owner in their own managedPages (their page role flips editor → owner). */
async function promoteHeirManagedPage(heir: string, type: PageType, id: string): Promise<void> {
  const ref = db.collection(USERS).doc(heir);
  const snap = await ref.get();
  if (!snap.exists) return;
  const pages = (snap.get("managedPages") as { type?: string; id?: string; role?: string }[] | undefined) ?? [];
  const next = pages.map((p) => (p.type === type && p.id === id ? { ...p, role: "owner" } : p));
  await ref.update({ managedPages: next, updatedAt: FieldValue.serverTimestamp() });
}

export const deleteAccount = onCall(async (request) => {
  const uid = requireCaller(request);
  const userRef = db.collection(USERS).doc(uid);
  const managed = ((await userRef.get()).get("managedPages") as { type?: PageType; id?: string }[] | undefined) ?? [];

  let pagesDeleted = 0;
  let pagesTransferred = 0;
  let editorResigned = 0;

  // Pages first. Sole-owned → deleted; owned-with-co-editor → transferred to the senior editor;
  // editor-only → resign (drop the uid from editorIds). Sequential: each may fan out a cascade.
  for (const page of managed) {
    const { type, id } = page;
    if ((type !== "business" && type !== "school") || typeof id !== "string") continue;
    const ref = db.collection(pageCollection(type)).doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;

    if (snap.get("ownerId") !== uid) {
      await ref.update({ editorIds: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() });
      editorResigned += 1;
      continue;
    }
    const editorIds = (snap.get("editorIds") as string[] | undefined) ?? [];
    const heir = editorIds.find((e) => typeof e === "string" && e !== uid);
    if (heir) {
      await ref.update({
        ownerId: heir,
        editorIds: FieldValue.arrayRemove(heir),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await promoteHeirManagedPage(heir, type, id);
      pagesTransferred += 1;
    } else {
      if (type === "business") await purgeBusiness(id);
      else await purgeSchool(id);
      pagesDeleted += 1;
    }
  }

  // Personal support records: anonymize (keep the anonymous money figure, erase the identity).
  const [subscriptions, projectContributions, pageantVotes, raffleOrders, productOrders, bingoOrders] =
    await Promise.all([
      anonymizeDonorRecords("subscriptions", "donorId", uid),
      anonymizeDonorRecords("projectContributions", "donorId", uid),
      anonymizeDonorRecords("pageantVotes", "buyerId", uid),
      anonymizeDonorRecords("raffleOrders", "buyerId", uid),
      anonymizeDonorRecords("productOrders", "buyerId", uid),
      anonymizeDonorRecords("bingoOrders", "buyerId", uid),
    ]);

  // Reviews the user authored (doc id = uid in each business's reviews). Delete → recompute the
  // business's reviewStats (onReviewWritten). Thank-yous + recognition profile go with the identity.
  const reviews = await db.collectionGroup(REVIEWS).where("authorId", "==", uid).get();
  await inChunks(reviews.docs, (d) => d.ref.delete());
  const thanks = await db.collection(THANK_YOUS).where("donorId", "==", uid).get();
  await inChunks(thanks.docs, (d) => d.ref.delete());

  // Delete the user doc BEFORE the recognition profile. The anonymizing writes above re-fire
  // recomputeDonorProfile, whose guard deletes the profile only once the user is gone — so removing
  // the user first makes "no profile" the steady state any late trigger converges to. The explicit
  // delete then covers the case where there were no donations to anonymize (no trigger fires at all).
  await userRef.delete().catch(() => {});
  await db.collection(DONOR_PROFILES).doc(uid).delete().catch(() => {});

  // Finally the Auth account. If this fails the user could still sign in (and re-create users/{uid}),
  // so surface it loudly rather than report a clean erasure.
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    logger.error("deleteAccount: auth.deleteUser failed", { uid, err: String(err) });
    throw new HttpsError("internal", "No se pudo eliminar la cuenta de acceso. Intenta de nuevo.");
  }

  await db.collection(DELETION_EVENTS).add({
    type: "account_deleted",
    actorUid: uid,
    pagesDeleted,
    pagesTransferred,
    editorResigned,
    subscriptions,
    projectContributions,
    pageantVotes,
    orders: raffleOrders + productOrders + bingoOrders,
    reviews: reviews.size,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, pagesDeleted, pagesTransferred, editorResigned };
});
