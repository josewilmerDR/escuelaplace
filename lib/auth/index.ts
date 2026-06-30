/**
 * Authentication helpers (client). Login is Google-only.
 *
 * On first sign-in we create the user's Firestore doc (`users/{uid}`) with an empty
 * `managedPages` list and the global role `'user'` (only admins get `'admin'`, set
 * out-of-band). Pages (businesses/schools) are created later from the panel.
 */
import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, getFirebaseAuth } from "@/lib/firebase";
import type { User, UserDoc } from "@/types";

const USERS = "users";

/**
 * Ensure a Firestore user doc exists for the signed-in Firebase user, creating it on
 * first login. Returns the typed doc. Idempotent: existing docs are returned untouched.
 */
export async function ensureUserDoc(fbUser: FirebaseUser): Promise<UserDoc> {
  const ref = doc(db, USERS, fbUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { id: snap.id, ...(snap.data() as User) };
  }

  const newUser = {
    name: fbUser.displayName ?? "",
    email: fbUser.email ?? "",
    role: "user" as const,
    managedPages: [],
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, newUser);

  // Re-read so callers get the resolved server timestamp instead of the sentinel.
  const created = await getDoc(ref);
  return { id: created.id, ...(created.data() as User) };
}

/** Sign in with Google (popup) and ensure the Firestore user doc exists. */
export async function signInWithGoogle(): Promise<UserDoc> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return ensureUserDoc(cred.user);
}

/** Sign the current user out. */
export async function signOutUser(): Promise<void> {
  await fbSignOut(getFirebaseAuth());
}

/**
 * Re-prove the current user's identity with a fresh Google popup. Required before an irreversible,
 * security-sensitive action (account deletion): Firebase only honors such actions with recent
 * credentials, and it confirms the person at the keyboard is really the account holder.
 */
export async function reauthenticateWithGoogle(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("No hay una sesión activa.");
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
}
