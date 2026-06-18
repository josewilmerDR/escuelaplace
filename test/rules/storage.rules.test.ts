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
import {
  deleteObject,
  getBytes,
  ref,
  uploadString,
  type FirebaseStorage,
} from "firebase/storage";
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

const PNG = "image/png";
const PDF = "application/pdf";

/**
 * Upload `bytes` raw bytes with an EXPLICIT contentType. The P1-c rules check both
 * request.resource.contentType and request.resource.size, so every write assertion must set
 * a realistic contentType (uploadString defaults to text/plain, which the matcher rejects) and
 * a known byte size (uploadString 'raw' → size == the string's byte length). Use a tiny payload
 * by default; pass a large `bytes` to exercise the size backstop.
 */
function put(
  st: FirebaseStorage,
  path: string,
  contentType: string,
  bytes = 16,
): Promise<unknown> {
  return uploadString(ref(st, path), "x".repeat(bytes), "raw", { contentType });
}

const ASSET_MAX = 12 * 1024 * 1024;

// ── Business assets: public read; write gated by ownership + shape (P1-c, #7) ─
describe("storage: business assets (ownership + write-shape)", () => {
  const logo = "businesses/biz1/logo";
  const cover = "businesses/biz1/cover";
  const gallery = "businesses/biz1/gallery/111";

  beforeEach(async () => {
    await seedFirestore((db) =>
      setDoc(doc(db, "businesses", "biz1"), { ownerId: "alice", editorIds: ["carol"] }),
    );
  });

  it("ALLOWS anyone to read a business asset", async () => {
    await seedObject(logo);
    await assertSucceeds(getBytes(ref(storageOf(), logo)));
  });

  it("ALLOWS the business OWNER to write an image asset", async () => {
    await assertSucceeds(put(storageOf("alice"), logo, PNG));
  });

  it("ALLOWS a co-EDITOR to write a gallery photo", async () => {
    await assertSucceeds(put(storageOf("carol"), gallery, "image/jpeg"));
  });

  it("DENIES a signed-in STRANGER writing a business asset (core #7 fix)", async () => {
    await assertFails(put(storageOf("mallory"), logo, PNG));
  });

  it("DENIES an anonymous user writing a business asset", async () => {
    await assertFails(put(storageOf(), logo, PNG));
  });

  it("DENIES the owner uploading an OVER-CAP asset (size backstop)", async () => {
    await assertFails(put(storageOf("alice"), cover, PNG, ASSET_MAX + 1));
  });

  it("DENIES the owner uploading a non-image contentType (type backstop)", async () => {
    await assertFails(put(storageOf("alice"), logo, "text/html"));
    await assertFails(put(storageOf("alice"), logo, PDF)); // business paths are image-only
  });

  it("ALLOWS the owner to DELETE a gallery photo (delete has no shape check)", async () => {
    await seedObject(gallery);
    await assertSucceeds(deleteObject(ref(storageOf("alice"), gallery)));
  });

  it("DENIES a stranger deleting a business asset", async () => {
    await seedObject(gallery);
    await assertFails(deleteObject(ref(storageOf("mallory"), gallery)));
  });
});

// ── School assets: photo/cover/gallery image-only; project quotes allow PDF ────
describe("storage: school assets (ownership + write-shape)", () => {
  beforeEach(async () => {
    await seedFirestore((db) =>
      setDoc(doc(db, "schools", "sch1"), { ownerId: "bob", editorIds: [] }),
    );
  });

  it("ALLOWS the school owner to write a photo/cover image", async () => {
    await assertSucceeds(put(storageOf("bob"), "schools/sch1/photo", PNG));
    await assertSucceeds(put(storageOf("bob"), "schools/sch1/gallery/1", "image/webp"));
  });

  it("DENIES a stranger writing a school asset", async () => {
    await assertFails(put(storageOf("mallory"), "schools/sch1/cover", PNG));
  });

  it("DENIES a PDF as a school photo/cover (image-only outside the projects subtree)", async () => {
    await assertFails(put(storageOf("bob"), "schools/sch1/photo", PDF));
  });

  it("ALLOWS the school owner to write a project cover (image) and a project quote (PDF)", async () => {
    await assertSucceeds(put(storageOf("bob"), "schools/sch1/projects/p1/cover-1", PNG));
    await assertSucceeds(put(storageOf("bob"), "schools/sch1/projects/p1/quote-1", PDF));
  });

  it("DENIES a stranger writing a project quote (even with a valid PDF)", async () => {
    await assertFails(put(storageOf("mallory"), "schools/sch1/projects/p1/quote-2", PDF));
  });

  it("DENIES the owner uploading an over-cap project asset", async () => {
    await assertFails(put(storageOf("bob"), "schools/sch1/projects/p1/photo-1", PNG, ASSET_MAX + 1));
  });

  it("ALLOWS the owner to delete a gallery photo", async () => {
    await seedObject("schools/sch1/gallery/9");
    await assertSucceeds(deleteObject(ref(storageOf("bob"), "schools/sch1/gallery/9")));
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
    await assertSucceeds(put(storageOf("alice"), proof, PDF));
    await assertSucceeds(getBytes(ref(storageOf("alice"), proof)));
  });

  it("ALLOWS the target school's owner to READ the proof (to verify)", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(storageOf("bob"), proof)));
  });

  it("DENIES the target school's owner from WRITING the proof", async () => {
    await assertFails(put(storageOf("bob"), proof, PDF));
  });

  it("DENIES a stranger reading or writing the proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(storageOf("mallory"), proof)));
    await assertFails(put(storageOf("mallory"), proof, PDF));
  });

  it("DENIES a valid supporter uploading a wrong type or an over-cap proof (write-shape)", async () => {
    await assertFails(put(storageOf("alice"), proof, "text/plain"));
    await assertFails(put(storageOf("alice"), proof, PDF, ASSET_MAX + 1));
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
    await assertSucceeds(put(storageOf("dana"), proof, PNG));
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
    await assertSucceeds(put(storageOf("dana"), proof, PDF));
    await assertSucceeds(getBytes(ref(storageOf("dana"), proof)));
  });

  it("ALLOWS the target school's owner to READ but NOT write the proof", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(storageOf("bob"), proof)));
    await assertFails(put(storageOf("bob"), proof, PDF));
  });

  it("DENIES the contributor uploading a wrong type or an over-cap proof (write-shape)", async () => {
    await assertFails(put(storageOf("dana"), proof, "application/octet-stream"));
    await assertFails(put(storageOf("dana"), proof, PDF, ASSET_MAX + 1));
  });

  it("DENIES a stranger and anonymous reads of the proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(storageOf("mallory"), proof)));
    await assertFails(getBytes(ref(storageOf(), proof)));
  });
});
