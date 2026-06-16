/**
 * Firestore security-rules tests (@firebase/rules-unit-testing + Vitest, against the emulator).
 *
 * Run with `npm run test:rules` (firebase emulators:exec starts the emulator and sets
 * FIRESTORE_EMULATOR_HOST). NOT part of the fast `npm test` unit run.
 *
 * Every access pattern gets an allow-case AND a deny-case. The deny-cases are the security
 * boundary — they are what stops a scripted client from doing what the UI forbids. Heavy focus
 * on the invariants that live ONLY in the rules (no server API enforces them), especially the
 * P0 fixes: admin-role escalation, the school re-verification downgrade, and self-* gates.
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  type Firestore,
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-escuelaplace";

let testEnv: RulesTestEnvironment;

/** Parse "host:port" from the emulator env var emulators:exec injects. */
function hostPort(envVar: string, fallbackPort: number): { host: string; port: number } {
  const raw = process.env[envVar];
  if (!raw) return { host: "127.0.0.1", port: fallbackPort };
  const [host, port] = raw.split(":");
  return { host, port: Number(port) };
}

beforeAll(async () => {
  const fs = hostPort("FIRESTORE_EMULATOR_HOST", 8080);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: fs.host,
      port: fs.port,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ── Context helpers ─────────────────────────────────────────────────────────
// rules-unit-testing's context.firestore() is typed as the compat Firestore; cast to the
// modular one (they're the same instance at runtime) so the modular doc()/getDoc() accept it.
const dbOf = (ctx: { firestore: () => unknown }): Firestore =>
  ctx.firestore() as unknown as Firestore;
/** A signed-in user with no admin claim. */
const asUser = (uid: string): Firestore => dbOf(testEnv.authenticatedContext(uid));
/** A signed-in user whose token carries the admin custom claim (the new trust anchor). */
const asClaimAdmin = (uid: string): Firestore =>
  dbOf(testEnv.authenticatedContext(uid, { admin: true }));
/** An anonymous (signed-out) reader — the public catalog. */
const asAnon = (): Firestore => dbOf(testEnv.unauthenticatedContext());

/** Seed documents with the rules DISABLED (Admin-SDK-equivalent) to set up preconditions. */
async function seed(fn: (db: Firestore) => Promise<unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

// Common seed shapes.
const businessDoc = (ownerId: string, over: Record<string, unknown> = {}) => ({
  name: "Comercio",
  slug: "comercio",
  ownerId,
  editorIds: [],
  categories: ["cat1"],
  status: "active",
  ranking: { score: 5, totalDonated: 1000 },
  reviewStats: { count: 2, average: 4 },
  ...over,
});

const schoolDoc = (ownerId: string, over: Record<string, unknown> = {}) => ({
  name: "Escuela",
  ownerId,
  editorIds: [],
  status: "active",
  verified: false,
  verificationStatus: "pending",
  metrics: { supportingBusinesses: 0, uniqueSupporters: 0 },
  ...over,
});

// ── users/{uid}: admin-role escalation (P0-a) ────────────────────────────────
describe("users/{uid} — role is the admin trust anchor (P0-a)", () => {
  it("DENIES creating your own user doc seeded as admin", async () => {
    await assertFails(
      setDoc(doc(asUser("alice"), "users", "alice"), {
        name: "Alice",
        role: "admin",
        managedPages: [],
      }),
    );
  });

  it("ALLOWS creating your own user doc as a plain user", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("alice"), "users", "alice"), {
        name: "Alice",
        role: "user",
        managedPages: [],
      }),
    );
  });

  it("DENIES self-promoting an existing user doc to admin", async () => {
    await seed((db) =>
      setDoc(doc(db, "users", "alice"), { name: "Alice", role: "user", managedPages: [] }),
    );
    await assertFails(updateDoc(doc(asUser("alice"), "users", "alice"), { role: "admin" }));
  });

  it("ALLOWS updating your own user doc while leaving role unchanged", async () => {
    await seed((db) =>
      setDoc(doc(db, "users", "alice"), { name: "Alice", role: "user", managedPages: [] }),
    );
    await assertSucceeds(updateDoc(doc(asUser("alice"), "users", "alice"), { name: "Alicia" }));
  });

  it("DENIES a non-admin writing another user's doc", async () => {
    await seed((db) =>
      setDoc(doc(db, "users", "bob"), { name: "Bob", role: "user", managedPages: [] }),
    );
    await assertFails(updateDoc(doc(asUser("alice"), "users", "bob"), { role: "admin" }));
  });

  it("ALLOWS an admin to change another user's role", async () => {
    await seed((db) =>
      setDoc(doc(db, "users", "bob"), { name: "Bob", role: "user", managedPages: [] }),
    );
    await assertSucceeds(updateDoc(doc(asClaimAdmin("root"), "users", "bob"), { role: "admin" }));
  });
});

// ── isAdmin(): custom claim is the anchor, the role field is a transitional fallback ─────────
describe("isAdmin() — custom claim grants admin; field is the fallback", () => {
  it("ALLOWS an admin-by-claim to write a category (no users doc needed)", async () => {
    await assertSucceeds(
      setDoc(doc(asClaimAdmin("root"), "categories", "cat1"), {
        name: "Comida",
        icon: "🍽️",
        order: 1,
      }),
    );
  });

  it("ALLOWS an admin-by-field (transitional fallback) to write a category", async () => {
    await seed((db) =>
      setDoc(doc(db, "users", "carol"), { name: "Carol", role: "admin", managedPages: [] }),
    );
    await assertSucceeds(
      setDoc(doc(asUser("carol"), "categories", "cat2"), { name: "Salud", icon: "➕", order: 2 }),
    );
  });

  it("DENIES a plain user writing a category", async () => {
    await assertFails(
      setDoc(doc(asUser("alice"), "categories", "cat3"), { name: "X", icon: "?", order: 3 }),
    );
  });
});

// ── schools: verification is admin-gated, and re-verification is enforced in rules (P0-c) ────
describe("schools — verification & re-verification (P0-c)", () => {
  it("ALLOWS an owner to create an unverified (pending) school", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("alice"), "schools", "sch1"), schoolDoc("alice")),
    );
  });

  it("DENIES creating a school already verified", async () => {
    await assertFails(
      setDoc(
        doc(asUser("alice"), "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      ),
    );
  });

  it("DENIES an owner self-verifying their school", async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("alice")));
    await assertFails(
      updateDoc(doc(asUser("alice"), "schools", "sch1"), {
        verified: true,
        verificationStatus: "verified",
      }),
    );
  });

  it("ALLOWS an admin to verify a school", async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("alice")));
    await assertSucceeds(
      updateDoc(doc(asClaimAdmin("root"), "schools", "sch1"), {
        verified: true,
        verificationStatus: "verified",
      }),
    );
  });

  it("DENIES renaming a VERIFIED school without dropping verification", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertFails(updateDoc(doc(asUser("alice"), "schools", "sch1"), { name: "Otra Escuela" }));
  });

  it("ALLOWS renaming a verified school when it also drops to needs_reverification", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "schools", "sch1"), {
        name: "Otra Escuela",
        verified: false,
        verificationStatus: "needs_reverification",
      }),
    );
  });

  it("ALLOWS editing a non-sensitive field (description) on a verified school", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "schools", "sch1"), { description: "Nueva desc" }),
    );
  });
});

// ── schools/{id}/private/data: payment methods (P0-c write-gate + read-gate) ──────────────────
describe("schools/{id}/private/data — payment methods", () => {
  it("DENIES the owner writing payment methods while the school is VERIFIED", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertFails(
      setDoc(doc(asUser("alice"), "schools", "sch1", "private", "data"), {
        paymentMethods: [{ label: "SINPE", value: "8888-8888" }],
      }),
    );
  });

  it("ALLOWS the owner writing payment methods on a pending school", async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("alice")));
    await assertSucceeds(
      setDoc(doc(asUser("alice"), "schools", "sch1", "private", "data"), {
        paymentMethods: [{ label: "SINPE", value: "8888-8888" }],
      }),
    );
  });

  it("ALLOWS the owner writing payment methods on a needs_reverification school", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verificationStatus: "needs_reverification" }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(asUser("alice"), "schools", "sch1", "private", "data"), {
        paymentMethods: [{ label: "SINPE", value: "7777-7777" }],
      }),
    );
  });

  it("ALLOWS an admin to write payment methods even on a verified school", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(asClaimAdmin("root"), "schools", "sch1", "private", "data"), {
        paymentMethods: [{ label: "SINPE", value: "1111-1111" }],
      }),
    );
  });

  it("DENIES anonymous reads of payment methods (even on a verified school)", async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "schools", "sch1", "private", "data"), {
        paymentMethods: [{ label: "SINPE", value: "1111-1111" }],
      });
    });
    await assertFails(getDoc(doc(asAnon(), "schools", "sch1", "private", "data")));
  });

  it("ALLOWS any signed-in user to read payment methods of a VERIFIED school", async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("alice", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "schools", "sch1", "private", "data"), {
        paymentMethods: [{ label: "SINPE", value: "1111-1111" }],
      });
    });
    await assertSucceeds(getDoc(doc(asUser("bob"), "schools", "sch1", "private", "data")));
  });

  it("DENIES a signed-in non-owner reading payment methods of an UNVERIFIED school", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("alice"));
      await setDoc(doc(db, "schools", "sch1", "private", "data"), {
        paymentMethods: [{ label: "SINPE", value: "1111-1111" }],
      });
    });
    await assertFails(getDoc(doc(asUser("bob"), "schools", "sch1", "private", "data")));
  });
});

// ── businesses: ownership + computed-field immutability ──────────────────────
describe("businesses — ownership & computed-field immutability", () => {
  it("ALLOWS the owner to create their business", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("alice"), "businesses", "biz1"), businessDoc("alice")),
    );
  });

  it("DENIES creating a business owned by someone else", async () => {
    await assertFails(
      setDoc(doc(asUser("alice"), "businesses", "biz1"), businessDoc("bob")),
    );
  });

  it("DENIES a non-admin update that changes the function-maintained ranking", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "biz1"), businessDoc("alice")));
    await assertFails(
      updateDoc(doc(asUser("alice"), "businesses", "biz1"), { ranking: { score: 9999, totalDonated: 0 } }),
    );
  });

  it("ALLOWS the owner to edit profile fields while leaving ranking intact", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "biz1"), businessDoc("alice")));
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "businesses", "biz1"), { name: "Comercio Nuevo" }),
    );
  });
});

// ── subscriptions: the supporter creates pending; only the school confirms ───
describe("subscriptions — create pending, no self-confirm", () => {
  const pendingSub = (over: Record<string, unknown> = {}) => ({
    supporterType: "business",
    businessId: "biz1",
    businessName: "Comercio",
    schoolId: "sch1",
    schoolName: "Escuela",
    units: 1,
    amount: 5000,
    status: "pending",
    confirmedAt: null,
    firstConfirmedAt: null,
    expiresAt: null,
    ...over,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob"));
    });
  });

  it("ALLOWS the business owner to create a pending subscription", async () => {
    await assertSucceeds(addDoc(collection(asUser("alice"), "subscriptions"), pendingSub()));
  });

  it("DENIES creating a subscription already confirmed", async () => {
    await assertFails(
      addDoc(collection(asUser("alice"), "subscriptions"), pendingSub({ status: "confirmed" })),
    );
  });

  it("DENIES a stranger creating a subscription for a business they don't own", async () => {
    await assertFails(addDoc(collection(asUser("mallory"), "subscriptions"), pendingSub()));
  });

  it("DENIES the supporter self-confirming their subscription", async () => {
    await seed((db) => setDoc(doc(db, "subscriptions", "sub1"), pendingSub()));
    await assertFails(updateDoc(doc(asUser("alice"), "subscriptions", "sub1"), { status: "confirmed" }));
  });

  it("ALLOWS the target school to confirm the subscription", async () => {
    await seed((db) => setDoc(doc(db, "subscriptions", "sub1"), pendingSub()));
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "subscriptions", "sub1"), {
        status: "confirmed",
        confirmedAt: new Date(),
        firstConfirmedAt: new Date(),
        confirmedBy: "bob",
        expiresAt: new Date(Date.now() + 90 * 86_400_000),
      }),
    );
  });
});

// ── projectContributions: created only against a verified school ─────────────
describe("projectContributions — create only when the school is verified", () => {
  const contribution = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    projectId: "proj1",
    projectTitle: "Cancha",
    type: "money",
    donorId: "dana",
    donorName: "Dana",
    amount: 10000,
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    ...over,
  });

  it("ALLOWS the contributor to create a pending contribution to a verified school", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertSucceeds(
      addDoc(collection(asUser("dana"), "projectContributions"), contribution()),
    );
  });

  it("DENIES creating a contribution when the school is NOT verified", async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("bob")));
    await assertFails(addDoc(collection(asUser("dana"), "projectContributions"), contribution()));
  });

  it("DENIES creating a contribution in someone else's name", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertFails(
      addDoc(collection(asUser("mallory"), "projectContributions"), contribution()),
    );
  });
});

// ── donorProfiles: computed fields seeded at zero; only prefs editable ───────
describe("donorProfiles — computed fields protected, isPublic gates reads", () => {
  const zeroed = (over: Record<string, unknown> = {}) => ({
    displayName: "Dana",
    isPublic: false,
    totalUnits: 0,
    tier: null,
    schoolsSupported: 0,
    projectsSupported: 0,
    firstConfirmedAt: null,
    lastConfirmedAt: null,
    ...over,
  });

  it("ALLOWS creating your own profile with every computed field zeroed", async () => {
    await assertSucceeds(setDoc(doc(asUser("dana"), "donorProfiles", "dana"), zeroed()));
  });

  it("DENIES seeding a non-zero tier/total on create", async () => {
    await assertFails(
      setDoc(doc(asUser("dana"), "donorProfiles", "dana"), zeroed({ tier: "gold", totalUnits: 99 })),
    );
  });

  it("DENIES self-assigning a tier on update", async () => {
    await seed((db) => setDoc(doc(db, "donorProfiles", "dana"), zeroed()));
    await assertFails(updateDoc(doc(asUser("dana"), "donorProfiles", "dana"), { tier: "platinum" }));
  });

  it("ALLOWS editing your own recognition prefs (displayName/isPublic)", async () => {
    await seed((db) => setDoc(doc(db, "donorProfiles", "dana"), zeroed()));
    await assertSucceeds(
      updateDoc(doc(asUser("dana"), "donorProfiles", "dana"), { isPublic: true, displayName: "D." }),
    );
  });

  it("DENIES reading another donor's PRIVATE profile", async () => {
    await seed((db) => setDoc(doc(db, "donorProfiles", "dana"), zeroed({ isPublic: false })));
    await assertFails(getDoc(doc(asUser("eve"), "donorProfiles", "dana")));
  });

  it("ALLOWS reading a PUBLIC profile", async () => {
    await seed((db) => setDoc(doc(db, "donorProfiles", "dana"), zeroed({ isPublic: true })));
    await assertSucceeds(getDoc(doc(asUser("eve"), "donorProfiles", "dana")));
  });
});

// ── private donor name: denormalized OFF the public doc so scrapers can't deanonymize (P0-d) ──
describe("private donor name (P0-d)", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob"));
      await setDoc(doc(db, "subscriptions", "sub1"), {
        supporterType: "user",
        donorId: "dana",
        schoolId: "sch1",
        schoolName: "Escuela",
        units: 1,
        amount: 5000,
        status: "pending",
        confirmedAt: null,
      });
      await setDoc(doc(db, "projectContributions", "c1"), {
        donorId: "dana",
        schoolId: "sch1",
        projectId: "p1",
        type: "money",
        amount: 10000,
        currency: "CRC",
        status: "pending",
        confirmedAt: null,
      });
    });
  });

  it("ALLOWS the donor to write their own subscription private record (name + magnitude)", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("dana"), "subscriptions", "sub1", "private", "data"), {
        donorName: "Dana",
        units: 1,
        amount: 5000,
      }),
    );
  });

  it("DENIES a stranger writing the subscription private name", async () => {
    await assertFails(
      setDoc(doc(asUser("mallory"), "subscriptions", "sub1", "private", "data"), { donorName: "X" }),
    );
  });

  it("reads of the subscription private name: donor & target school YES; anon & stranger NO", async () => {
    await seed((db) =>
      setDoc(doc(db, "subscriptions", "sub1", "private", "data"), { donorName: "Dana" }),
    );
    await assertSucceeds(getDoc(doc(asUser("dana"), "subscriptions", "sub1", "private", "data")));
    await assertSucceeds(getDoc(doc(asUser("bob"), "subscriptions", "sub1", "private", "data")));
    await assertFails(getDoc(doc(asAnon(), "subscriptions", "sub1", "private", "data")));
    await assertFails(getDoc(doc(asUser("mallory"), "subscriptions", "sub1", "private", "data")));
  });

  it("ALLOWS the contributor to write their own contribution private name", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("dana"), "projectContributions", "c1", "private", "data"), { donorName: "Dana" }),
    );
  });

  it("reads of the contribution private name: contributor & school YES; anon & stranger NO", async () => {
    await seed((db) =>
      setDoc(doc(db, "projectContributions", "c1", "private", "data"), { donorName: "Dana" }),
    );
    await assertSucceeds(getDoc(doc(asUser("dana"), "projectContributions", "c1", "private", "data")));
    await assertSucceeds(getDoc(doc(asUser("bob"), "projectContributions", "c1", "private", "data")));
    await assertFails(getDoc(doc(asAnon(), "projectContributions", "c1", "private", "data")));
    await assertFails(getDoc(doc(asUser("mallory"), "projectContributions", "c1", "private", "data")));
  });
});

// ── private magnitude: units/amount off the public doc, frozen after confirm (P0-d stage 2) ──
describe("private magnitude + anti-fraud freeze (P0-d stage 2)", () => {
  it("ALLOWS a donor's public donation WITHOUT units (magnitude lives in the private subdoc)", async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("bob")));
    await assertSucceeds(
      addDoc(collection(asUser("dana"), "subscriptions"), {
        supporterType: "user",
        donorId: "dana",
        schoolId: "sch1",
        schoolName: "Escuela",
        status: "pending",
        confirmedAt: null,
        firstConfirmedAt: null,
        expiresAt: null,
      }),
    );
  });

  it("DENIES a BUSINESS subscription created without units (still required on the public doc)", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob"));
    });
    await assertFails(
      addDoc(collection(asUser("alice"), "subscriptions"), {
        supporterType: "business",
        businessId: "biz1",
        businessName: "Comercio",
        schoolId: "sch1",
        schoolName: "Escuela",
        status: "pending",
        confirmedAt: null,
        firstConfirmedAt: null,
        expiresAt: null,
      }),
    );
  });

  it("requires a valid units on the private create (denies missing units)", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob"));
      await setDoc(doc(db, "subscriptions", "sub1"), {
        supporterType: "user",
        donorId: "dana",
        schoolId: "sch1",
        status: "pending",
        confirmedAt: null,
      });
    });
    await assertFails(
      setDoc(doc(asUser("dana"), "subscriptions", "sub1", "private", "data"), { donorName: "Dana" }),
    );
    await assertSucceeds(
      setDoc(doc(asUser("dana"), "subscriptions", "sub1", "private", "data"), {
        donorName: "Dana",
        units: 3,
        amount: 15000,
      }),
    );
  });

  it("FREEZES units/amount in private once the school confirmed; editable while pending", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob"));
      // pending donation
      await setDoc(doc(db, "subscriptions", "subP"), {
        supporterType: "user",
        donorId: "dana",
        schoolId: "sch1",
        status: "pending",
        confirmedAt: null,
      });
      await setDoc(doc(db, "subscriptions", "subP", "private", "data"), {
        donorName: "Dana",
        units: 1,
        amount: 5000,
      });
      // confirmed donation
      await setDoc(doc(db, "subscriptions", "subC"), {
        supporterType: "user",
        donorId: "dana",
        schoolId: "sch1",
        status: "confirmed",
        confirmedAt: new Date(),
      });
      await setDoc(doc(db, "subscriptions", "subC", "private", "data"), {
        donorName: "Dana",
        units: 1,
        amount: 5000,
      });
    });
    // while pending: the donor may still adjust the magnitude
    await assertSucceeds(
      updateDoc(doc(asUser("dana"), "subscriptions", "subP", "private", "data"), { units: 2, amount: 10000 }),
    );
    // once confirmed: units/amount are frozen (no tier inflation without a new proof)
    await assertFails(
      updateDoc(doc(asUser("dana"), "subscriptions", "subC", "private", "data"), { units: 999 }),
    );
    // but the name (not anti-fraud-sensitive) may still be corrected post-confirm
    await assertSucceeds(
      updateDoc(doc(asUser("dana"), "subscriptions", "subC", "private", "data"), { donorName: "Dana R." }),
    );
  });

  it("FREEZES a contribution's amount in private once confirmed", async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "projectContributions", "c1"), {
        donorId: "dana",
        schoolId: "sch1",
        projectId: "p1",
        type: "money",
        currency: "CRC",
        status: "confirmed",
        confirmedAt: new Date(),
      });
      await setDoc(doc(db, "projectContributions", "c1", "private", "data"), {
        donorName: "Dana",
        amount: 10000,
      });
    });
    await assertFails(
      updateDoc(doc(asUser("dana"), "projectContributions", "c1", "private", "data"), { amount: 999999 }),
    );
  });
});

// ── auditEvents / adminEvents: admin-only read, client-write forbidden ───────
describe("auditEvents & adminEvents — admin-only read, no client write", () => {
  it("DENIES a non-admin reading auditEvents", async () => {
    await seed((db) => setDoc(doc(db, "auditEvents", "e1"), { type: "subscription_confirmed" }));
    await assertFails(getDoc(doc(asUser("alice"), "auditEvents", "e1")));
  });

  it("ALLOWS an admin to read auditEvents", async () => {
    await seed((db) => setDoc(doc(db, "auditEvents", "e1"), { type: "subscription_confirmed" }));
    await assertSucceeds(getDoc(doc(asClaimAdmin("root"), "auditEvents", "e1")));
  });

  it("DENIES any client writing auditEvents (even admin)", async () => {
    await assertFails(setDoc(doc(asClaimAdmin("root"), "auditEvents", "e2"), { type: "x" }));
  });

  it("ALLOWS an admin to read adminEvents but DENIES client writes", async () => {
    await seed((db) => setDoc(doc(db, "adminEvents", "a1"), { type: "admin_granted" }));
    await assertSucceeds(getDoc(doc(asClaimAdmin("root"), "adminEvents", "a1")));
    await assertFails(setDoc(doc(asClaimAdmin("root"), "adminEvents", "a2"), { type: "admin_granted" }));
  });

  it("DENIES a non-admin reading adminEvents", async () => {
    await seed((db) => setDoc(doc(db, "adminEvents", "a1"), { type: "admin_granted" }));
    await assertFails(getDoc(doc(asUser("alice"), "adminEvents", "a1")));
  });
});

// ── public catalog reads stay open (SSR) ─────────────────────────────────────
describe("public catalog — anonymous reads stay open", () => {
  it("ALLOWS anonymous reads of businesses, schools and categories", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("alice"));
      await setDoc(doc(db, "categories", "cat1"), { name: "Comida", icon: "🍽️", order: 1 });
    });
    const anon = asAnon();
    await assertSucceeds(getDoc(doc(anon, "businesses", "biz1")));
    await assertSucceeds(getDoc(doc(anon, "schools", "sch1")));
    await assertSucceeds(getDoc(doc(anon, "categories", "cat1")));
  });

  it("DENIES anonymous writes to the catalog", async () => {
    await assertFails(setDoc(doc(asAnon(), "businesses", "biz2"), businessDoc("nobody")));
  });
});

// Sanity: the suite actually loaded the rules under test.
it("rules file is non-empty", () => {
  expect(readFileSync("firestore.rules", "utf8").length).toBeGreaterThan(100);
});
