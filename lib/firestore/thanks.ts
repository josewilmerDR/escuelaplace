/**
 * Typed reads AND writes of the donor/business thank-you feature.
 *
 * Two shapes live here:
 * - schools/{id}/config/thanks — the school's thank-you TEMPLATES (public read, owner/admin
 *   write). The school configures these once; the milestone-detector Cloud Function reads them
 *   when a milestone fires and auto-sends the matching one.
 * - thankYous/{id} — a delivered (or school-pending) thank-you for one supporter at one
 *   milestone. CREATED ONLY by the Cloud Function (clients can't create — see firestore.rules);
 *   here the school personalizes a `prompted` one + records its gesture, and the recipient marks
 *   it seen. Reads power the recipient's celebratory card and the school's "gestos" queue.
 *
 * The detector mirrors the pure decision in lib/thanks.ts (planThankYou). The platform never
 * touches money — a thank-you carries no figure, only gratitude.
 */
import {
  collection,
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
import { cache } from "react";
import { db, storage } from "@/lib/firebase";
import type {
  ThankYou,
  ThankYouConfig,
  ThankYouConfigDoc,
  ThankYouDoc,
  ThankYouMedia,
  ThankYouTemplate,
} from "@/types";
import {
  byCreatedAtDesc,
  chunkedInQuery,
  docToTyped,
  snapToList,
} from "./converters";

const SCHOOLS = "schools";
const THANK_YOUS = "thankYous";
/** Sub-path of a school's thank-you config: schools/{id}/config/thanks. */
const CONFIG = "config";
const THANKS_DOC = "thanks";

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * A school's thank-you template config, or null if it has none yet. Public read (it is shown
 * to supporters), so this runs both server-side (the detector reads it with Admin privileges,
 * but the panel reads it here) and from the panel. Wrapped in React cache() to dedupe within a
 * request.
 */
export const getSchoolThanksConfig = cache(
  async (schoolId: string): Promise<ThankYouConfigDoc | null> => {
    const snap = await getDoc(doc(db, SCHOOLS, schoolId, CONFIG, THANKS_DOC));
    return docToTyped<ThankYouConfig>(snap);
  },
);


/** Every thank-you addressed to a person (their celebratory feed), newest first. */
export async function getThankYousByDonor(
  donorId: string,
): Promise<ThankYouDoc[]> {
  const snap = await getDocs(
    query(collection(db, THANK_YOUS), where("donorId", "==", donorId)),
  );
  return snapToList<ThankYou>(snap).sort(byCreatedAtDesc);
}

/**
 * Every thank-you addressed to any of a set of business pages, newest first. Chunked `in`
 * queries (not N+1) so a user managing several businesses resolves in a handful of reads.
 */
export async function getThankYousForBusinesses(
  businessIds: string[],
): Promise<ThankYouDoc[]> {
  return (
    await chunkedInQuery<ThankYou>(THANK_YOUS, "businessId", businessIds)
  ).sort(byCreatedAtDesc);
}

/**
 * Every thank-you a school has produced (its queue + history), newest first. The school filters
 * `status === 'prompted'` in JS for its "gestos por hacer" list — keeping status out of the
 * query avoids a composite index, matching the rest of the MVP.
 */
export async function getThankYousBySchool(
  schoolId: string,
): Promise<ThankYouDoc[]> {
  const snap = await getDocs(
    query(collection(db, THANK_YOUS), where("schoolId", "==", schoolId)),
  );
  return snapToList<ThankYou>(snap).sort(byCreatedAtDesc);
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** A template as the editor submits it: blank-message templates are dropped before storing. */
export interface ThankYouConfigInput {
  welcome?: ThankYouTemplate;
  renewal?: ThankYouTemplate;
  anniversaryGeneric?: ThankYouTemplate;
  specialYears?: number[];
}

/** Drop a template whose message is blank (an empty template means "don't auto-send"). */
function cleanTemplate(t?: ThankYouTemplate): ThankYouTemplate | undefined {
  if (!t || !t.message.trim()) return undefined;
  const media: ThankYouMedia = {};
  if (t.media?.photoUrl) media.photoUrl = t.media.photoUrl;
  if (t.media?.videoUrl) media.videoUrl = t.media.videoUrl;
  return {
    message: t.message.trim(),
    ...(media.photoUrl || media.videoUrl ? { media } : {}),
  };
}

/**
 * Replace the school's thank-you config. Owner/editors or admin (rules enforce it). A full
 * replace (not a merge): the editor always submits the complete intended config, and blank
 * templates are dropped so a cleared field stops auto-sending. Must be called by the board.
 */
export async function updateSchoolThanksConfig(
  schoolId: string,
  input: ThankYouConfigInput,
): Promise<void> {
  const welcome = cleanTemplate(input.welcome);
  const renewal = cleanTemplate(input.renewal);
  const anniversaryGeneric = cleanTemplate(input.anniversaryGeneric);
  await setDoc(doc(db, SCHOOLS, schoolId, CONFIG, THANKS_DOC), {
    ...(welcome ? { welcome } : {}),
    ...(renewal ? { renewal } : {}),
    ...(anniversaryGeneric ? { anniversaryGeneric } : {}),
    ...(input.specialYears ? { specialYears: input.specialYears } : {}),
    updatedAt: serverTimestamp(),
  });
}

/** Public Storage path for a thank-you media file (image or short video). */
function thanksMediaPath(schoolId: string, suffix: string): string {
  return `${SCHOOLS}/${schoolId}/${THANKS_DOC}/${Date.now()}-${suffix}`;
}

/**
 * Upload a thank-you media file (a short clip of the kids, a photo) and return its public URL.
 * Stored under schools/{id}/thanks/... (owner/editor write, public read — see storage.rules).
 * The caller persists the URL onto the relevant template or prompted thank-you.
 */
export async function uploadThanksMedia(
  schoolId: string,
  kind: "photo" | "video",
  file: Blob,
): Promise<string> {
  const ref = storageRef(storage, thanksMediaPath(schoolId, kind));
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

/**
 * Deliver a school's personal thank-you for a `prompted` milestone: writes the message + any
 * media and flips it to `sent`. Owner/editors or admin (rules enforce it). The recipient then
 * sees it on their celebratory card.
 */
export async function sendPromptedThankYou(
  id: string,
  payload: { message: string; media?: ThankYouMedia },
): Promise<void> {
  const media: ThankYouMedia = {};
  if (payload.media?.photoUrl) media.photoUrl = payload.media.photoUrl;
  if (payload.media?.videoUrl) media.videoUrl = payload.media.videoUrl;
  await updateDoc(doc(db, THANK_YOUS, id), {
    status: "sent",
    message: payload.message.trim(),
    ...(media.photoUrl || media.videoUrl ? { media } : {}),
    deliveredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Record that the school did (or undid) the real-world gesture a milestone called for — the
 * letter sent, the placard placed. Owner/editors or admin. Purely the board's checklist; never
 * shown to the recipient.
 */
export async function markThankYouGesture(
  id: string,
  payload: { done: boolean; note?: string },
): Promise<void> {
  await updateDoc(doc(db, THANK_YOUS, id), {
    gestureDone: payload.done,
    ...(payload.note !== undefined ? { gestureNote: payload.note.trim() } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Mark a thank-you seen by its recipient (the donor or a manager of the recipient business), so
 * the celebratory card shows once and then settles into history. The only field the recipient
 * may write (rules enforce it).
 */
export async function markThankYouSeen(id: string): Promise<void> {
  await updateDoc(doc(db, THANK_YOUS, id), {
    seenByDonor: true,
    updatedAt: serverTimestamp(),
  });
}
