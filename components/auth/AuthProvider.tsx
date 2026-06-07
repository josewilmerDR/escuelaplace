"use client";

/**
 * Client-side auth context. Tracks the Firebase auth session and the matching Firestore
 * user doc, and exposes Google sign-in / sign-out. Wrap the app with <AuthProvider> (in
 * the root layout) and read state with useAuth().
 *
 * Public pages stay SSR and do NOT depend on this; it is for the header (login button)
 * and the private panel.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { ensureUserDoc, signInWithGoogle, signOutUser } from "@/lib/auth";
import type { UserDoc } from "@/types";

interface AuthState {
  /** Firebase auth user, or null when signed out. */
  fbUser: FirebaseUser | null;
  /** Firestore user doc (with managedPages), or null when signed out. */
  user: UserDoc | null;
  /** True until the initial auth state has resolved. */
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onAuthStateChanged(getFirebaseAuth(), async (fb) => {
        setFbUser(fb);
        try {
          setUser(fb ? await ensureUserDoc(fb) : null);
        } catch (err) {
          // A failed user-doc read (rules, connectivity) must not hang the app: surface
          // it and fall back to "signed out" so RequireAuth can show the login prompt.
          console.error("ensureUserDoc failed:", err);
          setUser(null);
        } finally {
          setLoading(false);
        }
      });
    } catch (err) {
      // e.g. auth/invalid-api-key when .env.local is missing or the dev server was
      // started before it existed. Don't leave the UI stuck on "loading" forever.
      console.error("Firebase Auth init failed:", err);
      // Defer so we don't setState synchronously inside the effect body.
      queueMicrotask(() => setLoading(false));
    }
    return () => unsub();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      fbUser,
      user,
      loading,
      // signInWithGoogle resolves the user doc; onAuthStateChanged also fires and
      // refreshes state, so we don't set it here to avoid races.
      signIn: async () => {
        await signInWithGoogle();
      },
      signOut: signOutUser,
    }),
    [fbUser, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the auth context. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
