/**
 * Storage security-rules tests (@firebase/rules-unit-testing + Vitest, against the emulators).
 *
 * Proof files (subscription / project-contribution payment proofs) are the most sensitive
 * objects in the bucket — financial PII, non-public. Their ownership is resolved through
 * Firestore (storage.rules calls firestore.get), so this suite seeds the referenced Firestore
 * docs and then asserts who may read/write each object. Public asset paths (logos/photos) are
 * also covered. Run with `npm run test:rules`.
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { getBytes, ref, uploadString, type FirebaseStorage } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "demo-escuelaplace";

let testEnv: RulesTestEnvironment;

function hostPort(envVar: string, fallbackPort: number): { host: string; port: number } {
  const raw = process.env[envVar];
  if (!raw) return { host: "127.0.0.1", port: fallbackPort };
  const [host, port] = raw.split(":");
  return { host, port: Number(port) };
}

beforeAll(async () => {
  const fs = hostPort("FIRESTORE_EMULATOR_HOST", 8588);
  const st = hostPort("FIREBASE_STORAGE_EMULATOR_HOST", 9588);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: fs.host, port: fs.port },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: st.host, port: st.port },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

// rules-unit-testing's context.storage()/firestore() are typed as the compat instances; cast
// to the modular ones (same instance at runtime) so the modular ref()/doc() accept them.
const storageOf = (uid?: string): FirebaseStorage =>
  (uid
    ? testEnv.authenticatedContext(uid).storage()
    : testEnv.unauthenticatedContext().storage()) as unknown as FirebaseStorage;

const asClaimAdmin = (uid: string): FirebaseStorage =>
  testEnv.authenticatedContext(uid, { admin: true }).storage() as unknown as FirebaseStorage;

/** Seed Firestore docs (and optionally a Storage object) with the rules disabled. */
async function seedFirestore(fn: (db: Firestore) => Promise<unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}
async function seedObject(path: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadString(ref(ctx.storage() as unknown as FirebaseStorage, path), "proof-bytes");
  });
}

// ── Public asset paths ───────────────────────────────────────────────────────
describe("storage: public assets (logos/photos)", () => {
  const logo = "businesses/biz1/logo";

  it("ALLOWS anyone to read a business asset", async () => {
    await seedObject(logo);
    await assertSucceeds(getBytes(ref(storageOf(), logo)));
  });

  it("ALLOWS a signed-in user to write a business asset", async () => {
    await assertSucceeds(uploadString(ref(storageOf("alice"), logo), "img"));
  });

  it("DENIES an anonymous user writing a business asset", async () => {
    await assertFails(uploadString(ref(storageOf(), logo), "img"));
  });
});

// ── subscription-proofs: business-backed subscription ────────────────────────
describe("storage: subscription proof (business-backed)", () => {
  const proof = "subscription-proofs/sub1/proof";

  beforeEach(async () => {
    await seedFirestore(async (db) => {
      await setDoc(doc(db, "subscriptions", "sub1"), {
        supporterType: "business",
        businessId: "biz1",
        schoolId: "sch1",
      });
      await setDoc(doc(db, "businesses", "biz1"), { ownerId: "alice", editorIds: [] });
      await setDoc(doc(db, "schools", "sch1"), { ownerId: "bob", editorIds: [] });
    });
  });

  it("ALLOWS the business owner to write and read the proof", async () => {
    await assertSucceeds(uploadString(ref(storageOf("alice"), proof), "p"));
    await assertSucceeds(getBytes(ref(storageOf("alice"), proof)));
  });

  it("ALLOWS the target school's owner to READ the proof (to verify)", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(storageOf("bob"), proof)));
  });

  it("DENIES the target school's owner from WRITING the proof", async () => {
    await assertFails(uploadString(ref(storageOf("bob"), proof), "p"));
  });

  it("DENIES a stranger reading or writing the proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(storageOf("mallory"), proof)));
    await assertFails(uploadString(ref(storageOf("mallory"), proof), "p"));
  });

  it("DENIES an anonymous user reading the proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(storageOf(), proof)));
  });

  it("ALLOWS an admin to read the proof", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(asClaimAdmin("root"), proof)));
  });
});

// ── subscription-proofs: donor-backed (personal donation) ────────────────────
describe("storage: subscription proof (donor-backed)", () => {
  const proof = "subscription-proofs/sub2/proof";

  beforeEach(async () => {
    await seedFirestore(async (db) => {
      await setDoc(doc(db, "subscriptions", "sub2"), {
        supporterType: "user",
        donorId: "dana",
        schoolId: "sch1",
      });
      await setDoc(doc(db, "schools", "sch1"), { ownerId: "bob", editorIds: [] });
    });
  });

  it("ALLOWS the donor to write and read their own proof", async () => {
    await assertSucceeds(uploadString(ref(storageOf("dana"), proof), "p"));
    await assertSucceeds(getBytes(ref(storageOf("dana"), proof)));
  });

  it("ALLOWS the target school's owner to READ the donor proof", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(storageOf("bob"), proof)));
  });

  it("DENIES a stranger reading the donor proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(storageOf("mallory"), proof)));
  });
});

// ── project-contribution-proofs ──────────────────────────────────────────────
describe("storage: project-contribution proof", () => {
  const proof = "project-contribution-proofs/c1/proof";

  beforeEach(async () => {
    await seedFirestore(async (db) => {
      await setDoc(doc(db, "projectContributions", "c1"), {
        donorId: "dana",
        schoolId: "sch1",
      });
      await setDoc(doc(db, "schools", "sch1"), { ownerId: "bob", editorIds: [] });
    });
  });

  it("ALLOWS the contributor to write and read their own proof", async () => {
    await assertSucceeds(uploadString(ref(storageOf("dana"), proof), "p"));
    await assertSucceeds(getBytes(ref(storageOf("dana"), proof)));
  });

  it("ALLOWS the target school's owner to READ but NOT write the proof", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(storageOf("bob"), proof)));
    await assertFails(uploadString(ref(storageOf("bob"), proof), "p"));
  });

  it("DENIES a stranger and anonymous reads of the proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(storageOf("mallory"), proof)));
    await assertFails(getBytes(ref(storageOf(), proof)));
  });
});
