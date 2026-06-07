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
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
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
