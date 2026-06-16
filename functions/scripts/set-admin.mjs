/**
 * One-off bootstrap: grant (or revoke) the `admin` custom claim and mirror users/{uid}.role.
 *
 * Use this to create the FIRST admin — before any admin exists to call the grantAdminRole
 * callable. After that, manage admins through the callables (functions/src/admin.ts).
 *
 * Auth: uses Application Default Credentials. Either:
 *   - run `gcloud auth application-default login` (account with access to the project), or
 *   - set GOOGLE_APPLICATION_CREDENTIALS to a service-account key with Auth Admin rights.
 * Set GOOGLE_CLOUD_PROJECT (or FIREBASE_PROJECT) to the project id if it isn't inferred.
 *
 * Usage (from functions/):
 *   node scripts/set-admin.mjs <uid|email>            # grant admin
 *   node scripts/set-admin.mjs <uid|email> --revoke   # revoke admin
 *
 * The target must sign OUT and back IN (or refresh their ID token) for the claim to take
 * effect — this script revokes their refresh tokens to force that.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const arg = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!arg) {
  console.error("Usage: node scripts/set-admin.mjs <uid|email> [--revoke]");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const user = arg.includes("@")
  ? await auth.getUserByEmail(arg)
  : await auth.getUser(arg);

const claims = { ...(user.customClaims ?? {}) };
if (revoke) delete claims.admin;
else claims.admin = true;

await auth.setCustomUserClaims(user.uid, claims);
await db.collection("users").doc(user.uid).set(
  { role: revoke ? "user" : "admin", updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);
await auth.revokeRefreshTokens(user.uid);

console.log(
  `${revoke ? "Revoked" : "Granted"} admin for ${user.email ?? user.uid}. ` +
    "They must sign out and back in for the change to take effect.",
);
process.exit(0);
