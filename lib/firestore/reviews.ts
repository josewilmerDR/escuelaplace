/**
 * Reviews of a business: subcollection `businesses/{id}/reviews/{userId}` (doc id = author
 * uid, so one review per user per business is enforced by storage, no query needed). Public
 * read; writes require Google sign-in and the author can't own the business (firestore.rules).
 * Aggregated into the business's `reviewStats` by a Cloud Function (onReviewWritten).
 */
import { cache } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Review, ReviewDoc } from "@/types";
import { docToTyped, snapToList } from "./converters";

const BUSINESSES = "businesses";
const REVIEWS = "reviews";

function reviewsCol(businessId: string) {
  return collection(db, BUSINESSES, businessId, REVIEWS);
}

/**
 * Reviews of a business, newest first.
 *
 * Wrapped in React cache(): the public business profile reads it from both the shared
 * layout (review stats live on the doc, but the list feeds the "Reseñas" page) and the
 * "Reseñas" page during one request — the cache dedupes the read.
 */
export const getReviewsByBusiness = cache(
  async (businessId: string, max = 50): Promise<ReviewDoc[]> => {
    const q = query(
      reviewsCol(businessId),
      orderBy("createdAt", "desc"),
      fbLimit(max),
    );
    return snapToList<Review>(await getDocs(q));
  },
);

/** The signed-in user's own review of a business, or null if they haven't reviewed it. */
export async function getMyReview(
  businessId: string,
  uid: string,
): Promise<ReviewDoc | null> {
  return docToTyped<Review>(
    await getDoc(doc(db, BUSINESSES, businessId, REVIEWS, uid)),
  );
}

export interface UpsertReviewInput {
  businessId: string;
  authorId: string; // == signed-in uid; also the doc id
  authorName: string;
  rating: number; // 1–5
  text?: string;
}

/**
 * Create or update the author's review (doc id = authorId). Preserves the original
 * `createdAt` on edits. The Cloud Function recomputes the business's `reviewStats`.
 */
export async function upsertReview(input: UpsertReviewInput): Promise<void> {
  const ref = doc(db, BUSINESSES, input.businessId, REVIEWS, input.authorId);
  const existing = await getDoc(ref);
  await setDoc(ref, {
    authorId: input.authorId,
    authorName: input.authorName,
    rating: input.rating,
    text: input.text ?? "",
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Delete a review (the author, or an admin via rules). */
export async function deleteReview(
  businessId: string,
  authorId: string,
): Promise<void> {
  await deleteDoc(doc(db, BUSINESSES, businessId, REVIEWS, authorId));
}
