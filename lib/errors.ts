import { FirebaseError } from "firebase/app";

/**
 * User-facing message for a failed Firestore/Storage call. Raw Firebase messages are
 * English developer prose ("Missing or insufficient permissions") — useless to the
 * owner and leaking internals — so the actionable codes map to Spanish copy and
 * everything else falls back to the caller's context-specific message. The raw error
 * goes to the console for debugging.
 */
export function userErrorMessage(err: unknown, fallback: string): string {
  console.error(err);
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "permission-denied":
      case "storage/unauthorized":
        return "No tienes permiso para hacer esto. Vuelve a ingresar e intenta de nuevo.";
      case "unavailable":
        return "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.";
      case "unauthenticated":
        return "Tu sesión expiró. Vuelve a ingresar.";
    }
  }
  return fallback;
}
