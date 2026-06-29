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

/**
 * User-facing message for a failed CALLABLE (httpsCallable). Our callables author the message on
 * the "business" error codes as buyer-facing Spanish — e.g. the raffle arbiter's "Algunos números
 * ya fueron tomados" / per-buyer cap / bad-request — so surface those VERBATIM. Infra/auth codes
 * (unavailable, unauthenticated, internal…) carry developer prose, so they fall back to
 * userErrorMessage's curated mapping. The callable SDK prefixes codes with "functions/".
 */
export function callableErrorMessage(err: unknown, fallback: string): string {
  if (
    err instanceof FirebaseError &&
    (err.code === "functions/failed-precondition" ||
      err.code === "functions/resource-exhausted" ||
      err.code === "functions/invalid-argument")
  ) {
    console.error(err);
    return err.message;
  }
  return userErrorMessage(err, fallback);
}
