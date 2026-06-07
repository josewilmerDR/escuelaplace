/**
 * Inicialización del SDK de Firebase (cliente).
 *
 * Se usa el patrón singleton (getApps()) para evitar re-inicializar la app durante
 * el hot-reload de Next.js o en re-renders. La config se toma de variables de entorno
 * NEXT_PUBLIC_* (ver .env.local.example).
 *
 * NOTA SSR: estas instancias son del SDK de cliente. Las páginas públicas se renderizan
 * en servidor leyendo Firestore con este mismo SDK (lecturas públicas permitidas por las
 * reglas). Para operaciones privilegiadas a futuro (cron, admin) usar firebase-admin aparte.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

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

// db y storage no validan el apiKey al inicializar: pueden crearse en servidor (SSR).
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// Auth SÍ valida el apiKey al inicializar (lanza auth/invalid-api-key sin config).
// Se inicializa de forma perezosa para no romper el build/SSR cuando no hay .env.local.
// Usar getFirebaseAuth() desde componentes de cliente.
let _auth: Auth | undefined;
export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(app);
  return _auth;
}

export default app;
