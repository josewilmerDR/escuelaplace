/**
 * Admin role management (Gen 2 callables, Admin SDK).
 *
 * Admin authority is anchored on an unforgeable Firebase Auth custom claim
 * (request.auth.token.admin), enforced by firestore.rules / storage.rules. These callables are
 * the supported way to grant/revoke it: they set the claim, mirror it to users/{uid}.role (the
 * admin UI reads the field), revoke the target's refresh tokens so the new claim takes effect on
 * the next token refresh, and append the action to the admin-only `adminEvents` trail so the
 * highest-authority actor is itself reviewable. Only an existing admin (by claim) may call.
 *
 * Bootstrapping the FIRST admin — when no admin yet exists to call grantAdminRole — is done
 * out-of-band with the Admin SDK: see functions/scripts/set-admin.mjs and
 * docs/security/ADMIN-BOOTSTRAP.md.
 */
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from "firebase-functions/v2/https";

const USERS = "users";
const ADMIN_EVENTS = "adminEvents";
/** Firebase Auth uids are alphanumeric; reject anything else before touching the SDK. */
const UID_RE = /^[A-Za-z0-9]{1,128}$/;

/**
 * Set or clear the admin custom claim, mirror it to the user's `role` field, force the new
 * claim to take effect, and audit the action. Runs with Admin privileges (bypasses rules).
 */
async function setAdmin(
  targetUid: string,
  makeAdmin: boolean,
  actorUid: string,
): Promise<void> {
  const auth = getAuth();
  const db = getFirestore();

  // getUser throws on an unknown uid — surfaces as a clean callable error, never a junk write.
  const user = await auth.getUser(targetUid);
  const claims: Record<string, unknown> = { ...(user.customClaims ?? {}) };
  if (makeAdmin) claims.admin = true;
  else delete claims.admin;
  await auth.setCustomUserClaims(targetUid, claims);

  await db.collection(USERS).doc(targetUid).set(
    { role: makeAdmin ? "admin" : "user", updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // Without this the claim would only ride the next (hourly) ID-token refresh. Revoking forces
  // the target to refresh: they gain/lose admin on their next sign-in / token refresh.
  await auth.revokeRefreshTokens(targetUid);

  await db.collection(ADMIN_EVENTS).add({
    type: makeAdmin ? "admin_granted" : "admin_revoked",
    targetUid,
    actorUid,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** The signed-in caller must already be an admin (by custom claim). Returns their uid. */
function requireAdminCaller(request: CallableRequest): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  return request.auth.uid;
}

/** Extract and validate the target uid from the callable payload. */
function targetUidOf(data: unknown): string {
  const uid = (data as { uid?: unknown } | null | undefined)?.uid;
  if (typeof uid !== "string" || !UID_RE.test(uid)) {
    throw new HttpsError("invalid-argument", "Bad uid.");
  }
  return uid;
}

export const grantAdminRole = onCall(async (request) => {
  const actorUid = requireAdminCaller(request);
  await setAdmin(targetUidOf(request.data), true, actorUid);
  return { ok: true };
});

export const revokeAdminRole = onCall(async (request) => {
  const actorUid = requireAdminCaller(request);
  const targetUid = targetUidOf(request.data);
  if (targetUid === actorUid) {
    // Refuse self-revoke so an admin can't strand the platform without its last admin.
    throw new HttpsError("failed-precondition", "Refuse to revoke your own admin.");
  }
  await setAdmin(targetUid, false, actorUid);
  return { ok: true };
});
