/**
 * Firebase SDK initialization (client).
 *
 * Uses the singleton pattern (getApps()) to avoid re-initializing the app during
 * Next.js hot-reload or on re-renders. Config is read from NEXT_PUBLIC_* environment
 * variables (see .env.local.example).
 *
 * SSR NOTE: these are client SDK instances. Public pages are rendered on the server
 * reading Firestore with this same SDK (public reads allowed by the rules). For future
 * privileged operations (cron, admin) use firebase-admin separately.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  getLimitedUseToken,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  type Functions,
} from "firebase/functions";
import {
  getStorage,
  connectStorageEmulator,
  type FirebaseStorage,
} from "firebase/storage";

/**
 * When NEXT_PUBLIC_USE_EMULATORS is "true", all SDK instances point to the local
 * Firebase emulators (firebase.json) instead of the cloud. Hosts default to
 * 127.0.0.1 with the ports declared in firebase.json. This keeps development
 * isolated from production data and lets us seed test data freely.
 */
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
const EMULATOR_HOST = "127.0.0.1";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// db and storage do not validate the apiKey on init: they can be created on the server (SSR).
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

if (useEmulators) {
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
}

// Callable Cloud Functions (e.g. recordWalkIn). Lazy for symmetry with auth; callables
// are only invoked from client components, never during SSR.
let _functions: Functions | undefined;
export function getFirebaseFunctions(): Functions {
  if (!_functions) {
    _functions = getFunctions(app);
    if (useEmulators) {
      connectFunctionsEmulator(_functions, EMULATOR_HOST, 5001);
    }
  }
  return _functions;
}

/**
 * App Check (reCAPTCHA v3) — the bot wall for accountless, unauthenticated calls that matter, today
 * just the pageant "simpatía" applause (castPageantApplause). Initialized LAZILY and ONLY in the
 * browser when NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY is set; absent (the default), App Check is a
 * no-op and getAppCheckToken() returns null. Merely initializing it attaches tokens to requests but
 * enforces NOTHING — enforcement is flipped per service in the Firebase console — so this never
 * breaks the existing anonymous catalog reads.
 */
const appCheckSiteKey = process.env.NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY;
let _appCheck: AppCheck | null | undefined;
function getAppCheckInstance(): AppCheck | null {
  if (typeof window === "undefined" || !appCheckSiteKey) return null; // SSR or unconfigured
  if (_appCheck === undefined) {
    _appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return _appCheck;
}

/**
 * A fresh, SINGLE-USE App Check token for a protected call, or null when App Check isn't configured
 * yet (so the feature that needs it stays gated off until it is). Never throws — a token failure
 * resolves to null and the caller treats the action as unavailable.
 *
 * A LIMITED-use token (not the cached auto-refresh one) so the server can verify it with
 * `consume: true`: one token backs exactly one applause, closing the replay window where a harvested
 * token could be reused to stuff the sympathy tally (#N3, see castPageantApplause). Its only caller
 * is the accountless pageant applause; if a future caller needs a reusable token, add a separate one.
 */
export async function getAppCheckToken(): Promise<string | null> {
  const appCheck = getAppCheckInstance();
  if (!appCheck) return null;
  try {
    return (await getLimitedUseToken(appCheck)).token;
  } catch {
    return null;
  }
}

// Auth DOES validate the apiKey on init (throws auth/invalid-api-key without config).
// It is initialized lazily so it does not break the build/SSR when there is no .env.local.
// Use getFirebaseAuth() from client components.
let _auth: Auth | undefined;
export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(app);
    if (useEmulators) {
      connectAuthEmulator(_auth, `http://${EMULATOR_HOST}:9099`, {
        disableWarnings: true,
      });
    }
  }
  return _auth;
}

export default app;
