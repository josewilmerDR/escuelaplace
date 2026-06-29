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
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
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

// Common SEED shapes — minimal "already exists" docs written with rules DISABLED (so they need
// not satisfy the P1-b create-shape). Use these to set up an existing active business/school.
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

// Valid CREATE payloads — the exact field set createBusinessPage / createSchoolPage write, so a
// client create must pass the P1-b write-shape rules (draft/pending start, no junk keys, no
// editorIds seeding). Used wherever a test creates a page AS a signed-in user (not a seed).
const newBusiness = (ownerId: string, over: Record<string, unknown> = {}) => ({
  name: "Comercio",
  slug: "comercio",
  description: "",
  categories: ["cat1"],
  categoryNames: ["Comida"],
  location: { geohash: "d1", admin1: "", admin2: "", admin3: "" },
  schoolId: "",
  schoolName: "",
  contact: {},
  discount: { active: false, text: "" },
  photos: [],
  tags: [],
  status: "draft",
  verified: false,
  subscription: { active: false, plan: "", validUntil: null },
  ranking: { score: 0, totalDonated: 0 },
  reviewStats: { count: 0, average: 0 },
  metrics: { views: 0, interactions: 0 },
  ownerId,
  ...over,
});

const newSchool = (ownerId: string, over: Record<string, unknown> = {}) => ({
  name: "Escuela",
  description: "",
  thankYouMessage: "",
  location: { geohash: "d1", admin1: "", admin2: "", admin3: "" },
  boardContact: { name: "Junta" },
  status: "pending",
  verified: false,
  verificationStatus: "pending",
  metrics: { supportingBusinesses: 0, uniqueSupporters: 0 },
  ownerId,
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
      setDoc(doc(asUser("alice"), "schools", "sch1"), newSchool("alice")),
    );
  });

  it("DENIES creating a school already verified", async () => {
    await assertFails(
      setDoc(
        doc(asUser("alice"), "schools", "sch1"),
        newSchool("alice", { verified: true, verificationStatus: "verified" }),
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
      setDoc(doc(asUser("alice"), "businesses", "biz1"), newBusiness("alice")),
    );
  });

  it("DENIES creating a business owned by someone else", async () => {
    await assertFails(
      setDoc(doc(asUser("alice"), "businesses", "biz1"), newBusiness("bob")),
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

// ── businesses/{id}/private/data: owner email kept OFF the world-readable doc (#13) ───────────
// The business doc itself is world-readable (public catalog), but the owner's contact email is
// rendered on no public page. Relocating it here means an anonymous scrape of `businesses` no
// longer harvests it. Owner/editors/admin only; never anonymous.
describe("businesses/{id}/private/data — owner contact email (#13)", () => {
  it("ALLOWS the owner to write their private contact data", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "biz1"), businessDoc("alice")));
    await assertSucceeds(
      setDoc(doc(asUser("alice"), "businesses", "biz1", "private", "data"), {
        email: "owner@example.com",
      }),
    );
  });

  it("ALLOWS an editor to write the private contact data", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "businesses", "biz1"),
        businessDoc("alice", { editorIds: ["edith"] }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(asUser("edith"), "businesses", "biz1", "private", "data"), {
        email: "owner@example.com",
      }),
    );
  });

  it("DENIES a signed-in non-owner writing the private contact data", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "biz1"), businessDoc("alice")));
    await assertFails(
      setDoc(doc(asUser("mallory"), "businesses", "biz1", "private", "data"), {
        email: "evil@example.com",
      }),
    );
  });

  it("ALLOWS the owner to read their private contact data", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
      await setDoc(doc(db, "businesses", "biz1", "private", "data"), {
        email: "owner@example.com",
      });
    });
    await assertSucceeds(
      getDoc(doc(asUser("alice"), "businesses", "biz1", "private", "data")),
    );
  });

  it("DENIES anonymous reads of the private contact data (the #13 scrape gate)", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
      await setDoc(doc(db, "businesses", "biz1", "private", "data"), {
        email: "owner@example.com",
      });
    });
    await assertFails(
      getDoc(doc(asAnon(), "businesses", "biz1", "private", "data")),
    );
  });

  it("DENIES a signed-in non-owner reading the private contact data", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
      await setDoc(doc(db, "businesses", "biz1", "private", "data"), {
        email: "owner@example.com",
      });
    });
    await assertFails(
      getDoc(doc(asUser("bob"), "businesses", "biz1", "private", "data")),
    );
  });

  it("ALLOWS an admin to read and write the private contact data", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "biz1"), businessDoc("alice")));
    await assertSucceeds(
      setDoc(doc(asClaimAdmin("root"), "businesses", "biz1", "private", "data"), {
        email: "owner@example.com",
      }),
    );
    await assertSucceeds(
      getDoc(doc(asClaimAdmin("root"), "businesses", "biz1", "private", "data")),
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
  // The PUBLIC contribution doc carries NO amount/donorName — those live in private/data (P0-d).
  const contribution = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    projectId: "proj1",
    projectTitle: "Cancha",
    type: "money",
    donorId: "dana",
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

// ── write-shape validation (P1-b): reject oversized/garbage/extra fields & frozen-field abuse ──
// These are the systemic data-integrity boundary (#6) plus the ownerId/editorIds takeover (#4).
// The golden rule under test: keys().hasOnly() guards CREATE; diff().affectedKeys() guards UPDATE,
// so every legitimate partial write (gallery arrayUnion, status-only, proof, confirm) still passes.
describe("businesses — write-shape (P1-b)", () => {
  it("DENIES creating a business that is not draft/unverified", async () => {
    await assertFails(
      setDoc(doc(asUser("alice"), "businesses", "b"), newBusiness("alice", { status: "active" })),
    );
    await assertFails(
      setDoc(doc(asUser("alice"), "businesses", "b"), newBusiness("alice", { verified: true })),
    );
  });

  it("DENIES creating a business with an over-long description or a junk key", async () => {
    await assertFails(
      setDoc(doc(asUser("alice"), "businesses", "b"), newBusiness("alice", { description: "x".repeat(301) })),
    );
    await assertFails(
      setDoc(doc(asUser("alice"), "businesses", "b"), newBusiness("alice", { foo: "bar" })),
    );
  });

  it("ALLOWS publishing (status draft→active) and a gallery arrayUnion", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "b"), businessDoc("alice", { status: "draft" })));
    await assertSucceeds(updateDoc(doc(asUser("alice"), "businesses", "b"), { status: "active" }));
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "businesses", "b"), { photos: arrayUnion("https://x/1") }),
    );
  });

  it("ALLOWS an editor to edit the profile but DENIES taking over ownerId/editorIds", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "b"), businessDoc("alice", { editorIds: ["carol"] })));
    await assertSucceeds(updateDoc(doc(asUser("carol"), "businesses", "b"), { name: "Nuevo" }));
    await assertFails(updateDoc(doc(asUser("carol"), "businesses", "b"), { ownerId: "carol" }));
    await assertFails(
      updateDoc(doc(asUser("carol"), "businesses", "b"), { editorIds: ["carol", "carol2"] }),
    );
  });

  it("DENIES a non-admin update that changes slug or sets verified, or adds a junk key", async () => {
    await seed((db) => setDoc(doc(db, "businesses", "b"), businessDoc("alice")));
    await assertFails(updateDoc(doc(asUser("alice"), "businesses", "b"), { slug: "otro" }));
    await assertFails(updateDoc(doc(asUser("alice"), "businesses", "b"), { verified: true }));
    await assertFails(updateDoc(doc(asUser("alice"), "businesses", "b"), { foo: "bar" }));
  });
});

describe("schools — write-shape (P1-b)", () => {
  it("DENIES a non-admin seeding editorIds or an over-long description on create", async () => {
    await assertFails(
      setDoc(doc(asUser("alice"), "schools", "s"), newSchool("alice", { editorIds: ["alice"] })),
    );
    await assertFails(
      setDoc(doc(asUser("alice"), "schools", "s"), newSchool("alice", { description: "x".repeat(301) })),
    );
  });

  it("ALLOWS a gallery arrayUnion but DENIES ownerId/editorIds takeover and metrics tampering", async () => {
    await seed((db) => setDoc(doc(db, "schools", "s"), schoolDoc("alice")));
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "schools", "s"), { photos: arrayUnion("https://x/1") }),
    );
    await assertFails(updateDoc(doc(asUser("alice"), "schools", "s"), { ownerId: "eve" }));
    await assertFails(updateDoc(doc(asUser("alice"), "schools", "s"), { editorIds: ["eve"] }));
    await assertFails(
      updateDoc(doc(asUser("alice"), "schools", "s"), { metrics: { supportingBusinesses: 99, uniqueSupporters: 99 } }),
    );
  });
});

describe("schools/{id}/projects — write-shape (P1-b)", () => {
  const newProject = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    title: "Cancha",
    description: "Una cancha techada",
    currency: "CRC",
    status: "active",
    stages: [],
    raised: 0,
    contributorsCount: 0,
    ownerId: "bob",
    ...over,
  });

  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("bob")));
  });

  it("ALLOWS the school owner to create a valid active project", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), newProject()),
    );
  });

  it("DENIES create with a non-active status, an over-long title, too many stages, or a junk key", async () => {
    await assertFails(
      setDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), newProject({ status: "completed" })),
    );
    await assertFails(
      setDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), newProject({ title: "x".repeat(121) })),
    );
    await assertFails(
      setDoc(
        doc(asUser("bob"), "schools", "sch1", "projects", "p1"),
        newProject({ stages: Array.from({ length: 13 }, () => ({})) }),
      ),
    );
    await assertFails(
      setDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), newProject({ foo: "bar" })),
    );
  });

  it("ALLOWS editing stages and setting status, but DENIES changing ownerId or a junk key", async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1", "projects", "p1"), newProject()));
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), { stages: [{ title: "Etapa 1", cost: 1000 }] }),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), { status: "completed" }),
    );
    await assertFails(
      updateDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), { ownerId: "eve" }),
    );
    await assertFails(
      updateDoc(doc(asUser("bob"), "schools", "sch1", "projects", "p1"), { foo: "bar" }),
    );
  });
});

describe("tools — write-shape: generic config + WhatsApp contact (P1-b)", () => {
  // The board's createTool field set. The COVER is still added later via UPDATE (not in the create
  // set), but dates (startsAt/endsAt) and the WhatsApp contact (contactPhone/contactLabel) ARE in the
  // create set now (the create form sets them like the edit form), capped the same way. The kind
  // config lives under the single generic `config` map. Defaults to the config-less 'other' kind.
  const baseTool = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    type: "other",
    title: "Actividad",
    description: "Una actividad",
    status: "active",
    ownerId: "alice",
    ...over,
  });
  const raffleCfg = {
    numberCount: 100,
    pricePerNumber: 1000,
    currency: "CRC",
    prizes: ["Premio"],
    drawMethod: "tombola",
  };
  const eventCfg = { place: "Gimnasio" };

  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("alice")));
  });

  it("ALLOWS the owner to create a tool with a config map, and a config-less 'other'", async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser("alice"), "schools", "sch1", "tools", "t1"),
        baseTool({ type: "raffle", config: raffleCfg }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(asUser("alice"), "schools", "sch1", "tools", "t2"), baseTool()),
    );
  });

  it("ALLOWS creating a tool with an activity window AND a WhatsApp contact", async () => {
    // Parity with the edit form: dates + contactPhone/contactLabel are part of the create field set.
    await assertSucceeds(
      setDoc(
        doc(asUser("alice"), "schools", "sch1", "tools", "t1"),
        baseTool({
          startsAt: "2026-01-01",
          endsAt: "2026-02-01",
          contactPhone: "8888 8888",
          contactLabel: "Escríbenos",
        }),
      ),
    );
  });

  it("DENIES creating a tool with a contactLabel over the cap", async () => {
    // The create contact gets the SAME caps as update — a 41-char label is rejected.
    await assertFails(
      setDoc(
        doc(asUser("alice"), "schools", "sch1", "tools", "t1"),
        baseTool({ contactLabel: "x".repeat(41) }),
      ),
    );
  });

  it("DENIES creating a tool with a legacy per-kind field (pre-config shape)", async () => {
    // `raffle` is no longer in the create field set — the config must live under `config`.
    await assertFails(
      setDoc(
        doc(asUser("alice"), "schools", "sch1", "tools", "t1"),
        baseTool({ type: "raffle", raffle: raffleCfg }),
      ),
    );
  });

  it("ALLOWS an update that overwrites config on a kind switch AND deletes a legacy field", async () => {
    // A LEGACY doc (config under the per-kind `raffle` field), seeded with rules disabled.
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1", "tools", "t1"), baseTool({ type: "raffle", raffle: raffleCfg })),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "schools", "sch1", "tools", "t1"), {
        type: "event",
        config: eventCfg,
        raffle: deleteField(), // self-heal the legacy doc to `config`
      }),
    );
  });

  it("DENIES setting a legacy per-kind field on update (delete-only)", async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1", "tools", "t1"), baseTool({ type: "raffle", config: raffleCfg })),
    );
    // A client may DELETE a legacy field (migration) but never SET one.
    await assertFails(
      updateDoc(doc(asUser("alice"), "schools", "sch1", "tools", "t1"), {
        raffle: raffleCfg,
      }),
    );
  });

  it("ALLOWS setting the WhatsApp contact and ALLOWS clearing it", async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1", "tools", "t1"), baseTool({ type: "raffle", config: raffleCfg })),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "schools", "sch1", "tools", "t1"), {
        contactPhone: "8888 8888",
        contactLabel: "Consultar",
      }),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "schools", "sch1", "tools", "t1"), {
        contactPhone: deleteField(),
        contactLabel: deleteField(),
      }),
    );
  });

  it("DENIES a WhatsApp contact that exceeds its caps", async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1", "tools", "t1"), baseTool({ type: "raffle", config: raffleCfg })),
    );
    // contactLabel cap is 40; contactPhone cap is 30.
    await assertFails(
      updateDoc(doc(asUser("alice"), "schools", "sch1", "tools", "t1"), {
        contactLabel: "x".repeat(41),
      }),
    );
    await assertFails(
      updateDoc(doc(asUser("alice"), "schools", "sch1", "tools", "t1"), {
        contactPhone: "9".repeat(31),
      }),
    );
  });
});

describe("subscriptions — write-shape (P1-b)", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
      await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob"));
    });
  });

  const businessSub = (over: Record<string, unknown> = {}) => ({
    supporterType: "business",
    businessId: "biz1",
    businessName: "Comercio",
    schoolId: "sch1",
    schoolName: "Escuela",
    units: 2,
    amount: 10000,
    status: "pending",
    confirmedAt: null,
    firstConfirmedAt: null,
    expiresAt: null,
    ...over,
  });

  it("DENIES a business sub whose amount != units × 5000, units > 1000, or with a junk key", async () => {
    await assertFails(addDoc(collection(asUser("alice"), "subscriptions"), businessSub({ amount: 9999 })));
    await assertFails(
      addDoc(collection(asUser("alice"), "subscriptions"), businessSub({ units: 1001, amount: 5005000 })),
    );
    await assertFails(addDoc(collection(asUser("alice"), "subscriptions"), businessSub({ foo: "bar" })));
  });

  it("DENIES a donor smuggling units/amount onto the PUBLIC donation doc (P0-d)", async () => {
    await assertFails(
      addDoc(collection(asUser("dana"), "subscriptions"), {
        supporterType: "user",
        donorId: "dana",
        schoolId: "sch1",
        schoolName: "Escuela",
        units: 5,
        amount: 25000,
        status: "pending",
        confirmedAt: null,
        firstConfirmedAt: null,
        expiresAt: null,
      }),
    );
  });

  it("ALLOWS the supporter to upload a proof and the school to expire it", async () => {
    await seed((db) => setDoc(doc(db, "subscriptions", "sub1"), businessSub()));
    await assertSucceeds(
      updateDoc(doc(asUser("alice"), "subscriptions", "sub1"), { proofUploaded: true, updatedAt: new Date() }),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "subscriptions", "sub1"), { status: "expired", updatedAt: new Date() }),
    );
  });

  it("DENIES a supporter update that injects an unexpected field", async () => {
    await seed((db) => setDoc(doc(db, "subscriptions", "sub1"), businessSub()));
    await assertFails(updateDoc(doc(asUser("alice"), "subscriptions", "sub1"), { countsForRanking: true }));
  });
});

describe("projectContributions — write-shape (P1-b)", () => {
  beforeEach(async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1"), schoolDoc("bob", { verified: true, verificationStatus: "verified" })),
    );
  });

  const contrib = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    projectId: "proj1",
    projectTitle: "Cancha",
    type: "money",
    donorId: "dana",
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    ...over,
  });

  it("DENIES exposing amount on the public doc, a bad type enum, or an over-long title", async () => {
    await assertFails(addDoc(collection(asUser("dana"), "projectContributions"), contrib({ amount: 5000 })));
    await assertFails(addDoc(collection(asUser("dana"), "projectContributions"), contrib({ type: "cash" })));
    await assertFails(
      addDoc(collection(asUser("dana"), "projectContributions"), contrib({ projectTitle: "x".repeat(121) })),
    );
  });

  it("ALLOWS the contributor to upload a proof and the school to confirm", async () => {
    await seed((db) => setDoc(doc(db, "projectContributions", "c1"), contrib()));
    await assertSucceeds(
      updateDoc(doc(asUser("dana"), "projectContributions", "c1"), { proofUploaded: true, updatedAt: new Date() }),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "projectContributions", "c1"), {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: "bob",
        updatedAt: new Date(),
      }),
    );
  });
});

describe("donorProfiles — write-shape (P1-b)", () => {
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

  it("DENIES an over-long displayName or a junk key on create", async () => {
    await assertFails(setDoc(doc(asUser("dana"), "donorProfiles", "dana"), zeroed({ displayName: "x".repeat(61) })));
    await assertFails(setDoc(doc(asUser("dana"), "donorProfiles", "dana"), zeroed({ foo: "bar" })));
  });

  it("DENIES an unexpected field on a prefs update", async () => {
    await seed((db) => setDoc(doc(db, "donorProfiles", "dana"), zeroed()));
    await assertFails(updateDoc(doc(asUser("dana"), "donorProfiles", "dana"), { foo: "bar" }));
  });
});

// ── confirm transitions (P1-h / #11): contributions confirm ONCE; subscriptions may renew ──
// The state-machine guard that stops a re-confirm from re-stamping confirmedAt and making the
// Cloud Function append a DUPLICATE audit event under a fresh trigger event id.
describe("confirm transitions (P1-h)", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "businesses", "biz1"), businessDoc("alice"));
    });
  });

  const pendingContribution = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    projectId: "proj1",
    projectTitle: "Cancha",
    type: "money",
    donorId: "dana",
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    ...over,
  });

  it("ALLOWS the school to confirm a PENDING contribution (pending → confirmed)", async () => {
    await seed((db) => setDoc(doc(db, "projectContributions", "c1"), pendingContribution()));
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "projectContributions", "c1"), {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: "bob",
        updatedAt: new Date(),
      }),
    );
  });

  it("DENIES RE-confirming an already-confirmed contribution (no duplicate audit)", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "projectContributions", "c1"),
        pendingContribution({ status: "confirmed", confirmedAt: new Date(), confirmedBy: "bob" }),
      ),
    );
    await assertFails(
      updateDoc(doc(asUser("bob"), "projectContributions", "c1"), {
        status: "confirmed",
        confirmedAt: new Date(Date.now() + 1000),
        confirmedBy: "bob",
        updatedAt: new Date(),
      }),
    );
  });

  it("ALLOWS the school to RENEW a subscription (confirmed → confirmed re-stamp)", async () => {
    await seed((db) =>
      setDoc(doc(db, "subscriptions", "sub1"), {
        supporterType: "business",
        businessId: "biz1",
        businessName: "Comercio",
        schoolId: "sch1",
        schoolName: "Escuela",
        units: 1,
        amount: 5000,
        status: "confirmed",
        confirmedAt: new Date(),
        firstConfirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 86_400_000),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "subscriptions", "sub1"), {
        status: "confirmed",
        confirmedAt: new Date(Date.now() + 1000),
        confirmedBy: "bob",
        expiresAt: new Date(Date.now() + 180 * 86_400_000),
        updatedAt: new Date(),
      }),
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

// ── bingo cartones (cards) + bingoOrders ─────────────────────────────────────
describe("bingo cards subcollection — public read, school-only write", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "schools", "sch1", "tools", "tool1", "cards", "card1"), {
        label: "001",
        numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        status: "available",
        createdAt: new Date(),
      });
    });
  });

  it("ALLOWS anyone to read a cartón (numbers aren't secret)", async () => {
    await assertSucceeds(
      getDoc(doc(asAnon(), "schools", "sch1", "tools", "tool1", "cards", "card1")),
    );
  });

  it("ALLOWS the school to assign a cartón (status/owner update)", async () => {
    await assertSucceeds(
      updateDoc(
        doc(asUser("bob"), "schools", "sch1", "tools", "tool1", "cards", "card1"),
        { status: "sold", soldOrderId: "o1", ownerId: "dana" },
      ),
    );
  });

  it("DENIES a buyer/stranger writing a cartón (numbers are integrity-critical)", async () => {
    await assertFails(
      updateDoc(
        doc(asUser("mallory"), "schools", "sch1", "tools", "tool1", "cards", "card1"),
        { numbers: [9, 9, 9, 9, 9, 9, 9, 9, 9] },
      ),
    );
  });

  it("ALLOWS the school to create a valid cartón (bounded label + numbers) (#N6)", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1", "cards", "card2"), {
        label: "002",
        numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        status: "available",
        createdAt: new Date(),
      }),
    );
  });

  it("DENIES a cartón with an oversize label or number list (#N6)", async () => {
    await assertFails(
      setDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1", "cards", "card3"), {
        label: "x".repeat(41),
        numbers: [1, 2, 3],
        status: "available",
        createdAt: new Date(),
      }),
    );
    await assertFails(
      setDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1", "cards", "card4"), {
        label: "004",
        numbers: Array.from({ length: 82 }, (_, i) => i),
        status: "available",
        createdAt: new Date(),
      }),
    );
  });
});

describe("bingoOrders — create when verified, school-only confirm + assign", () => {
  const bingoOrder = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    toolId: "tool1",
    toolTitle: "Bingo",
    buyerId: "dana",
    quantity: 3,
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    ...over,
  });

  it("ALLOWS the buyer to create a pending order to a verified school", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertSucceeds(
      addDoc(collection(asUser("dana"), "bingoOrders"), bingoOrder()),
    );
  });

  it("DENIES creating an order when the school is NOT verified", async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("bob")));
    await assertFails(
      addDoc(collection(asUser("dana"), "bingoOrders"), bingoOrder()),
    );
  });

  it("DENIES creating an order in someone else's name", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      ),
    );
    await assertFails(
      addDoc(collection(asUser("mallory"), "bingoOrders"), bingoOrder()),
    );
  });

  it("ALLOWS the school to confirm + assign cartones (pending → confirmed)", async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "bingoOrders", "o1"), bingoOrder());
    });
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "bingoOrders", "o1"), {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: "bob",
        cardIds: ["card1", "card2", "card3"],
        updatedAt: new Date(),
      }),
    );
  });

  it("DENIES the buyer self-confirming their order", async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "bingoOrders", "o1"), bingoOrder());
    });
    await assertFails(
      updateDoc(doc(asUser("dana"), "bingoOrders", "o1"), {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: "dana",
        updatedAt: new Date(),
      }),
    );
  });

  it("DENIES the buyer assigning cartones to themselves (cardIds is school-only)", async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "bingoOrders", "o1"), bingoOrder());
    });
    await assertFails(
      updateDoc(doc(asUser("dana"), "bingoOrders", "o1"), {
        cardIds: ["card1", "card2", "card3"],
        updatedAt: new Date(),
      }),
    );
  });

  it("ALLOWS the buyer to write their private name+amount, DENIES a stranger reading it", async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      await setDoc(doc(db, "bingoOrders", "o1"), bingoOrder());
    });
    await assertSucceeds(
      setDoc(doc(asUser("dana"), "bingoOrders", "o1", "private", "data"), {
        buyerName: "Dana",
        amount: 4500,
      }),
    );
    await assertFails(
      getDoc(doc(asUser("mallory"), "bingoOrders", "o1", "private", "data")),
    );
  });
});

describe("order shared invariants (raffle/product/bingo, P1-b)", () => {
  // The three buyable kinds share ONE rules skeleton (orderCreateGate / validOrderUpdateFields /
  // orderUpdateActor / orderPrivate*). These assert the cross-cutting money-boundary invariants on
  // EACH kind so the shared logic can't silently regress for one of them — the verified-school
  // create gate and the "no money on the public doc" rule (#5).
  const KINDS: { name: string; order: (over?: Record<string, unknown>) => Record<string, unknown> }[] = [
    {
      name: "raffleOrders",
      order: (over = {}) => ({
        schoolId: "sch1", schoolName: "Escuela", toolId: "tool1", toolTitle: "Rifa",
        buyerId: "dana", numbers: [1, 2], currency: "CRC",
        status: "pending", confirmedAt: null, ...over,
      }),
    },
    {
      name: "productOrders",
      order: (over = {}) => ({
        schoolId: "sch1", schoolName: "Escuela", toolId: "tool1", toolTitle: "Productos",
        buyerId: "dana", productId: "p1", productName: "Huevos", quantity: 2, currency: "CRC",
        status: "pending", confirmedAt: null, ...over,
      }),
    },
    {
      name: "bingoOrders",
      order: (over = {}) => ({
        schoolId: "sch1", schoolName: "Escuela", toolId: "tool1", toolTitle: "Bingo",
        buyerId: "dana", quantity: 3, currency: "CRC",
        status: "pending", confirmedAt: null, ...over,
      }),
    },
  ];

  const seedSchool = (over: Record<string, unknown>) =>
    seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("bob", over)));
  const VERIFIED = { verified: true, verificationStatus: "verified" };

  for (const k of KINDS) {
    describe(k.name, () => {
      it("DENIES create when the school is NOT verified (shared verified gate)", async () => {
        await seedSchool({});
        await assertFails(addDoc(collection(asUser("dana"), k.name), k.order()));
      });

      it("DENIES create that puts money on the public doc (amount / buyerName)", async () => {
        await seedSchool(VERIFIED);
        await assertFails(
          addDoc(collection(asUser("dana"), k.name), k.order({ amount: 5000 })),
        );
        await assertFails(
          addDoc(collection(asUser("dana"), k.name), k.order({ buyerName: "Dana" })),
        );
      });

      it("DENIES create forced to a non-pending / pre-confirmed state", async () => {
        await seedSchool(VERIFIED);
        await assertFails(
          addDoc(collection(asUser("dana"), k.name), k.order({ status: "confirmed" })),
        );
        await assertFails(
          addDoc(collection(asUser("dana"), k.name), k.order({ confirmedAt: new Date() })),
        );
      });

      it("DENIES the buyer self-confirming; ALLOWS the target school to confirm", async () => {
        await seed(async (db) => {
          await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob", VERIFIED));
          await setDoc(doc(db, k.name, "o1"), k.order());
        });
        await assertFails(
          updateDoc(doc(asUser("dana"), k.name, "o1"), {
            status: "confirmed", confirmedAt: new Date(), confirmedBy: "dana", updatedAt: new Date(),
          }),
        );
        await assertSucceeds(
          updateDoc(doc(asUser("bob"), k.name, "o1"), {
            status: "confirmed", confirmedAt: new Date(), confirmedBy: "bob", updatedAt: new Date(),
          }),
        );
      });

      it("private name+amount: buyer writes, target school reads, stranger denied", async () => {
        await seed(async (db) => {
          await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob", VERIFIED));
          await setDoc(doc(db, k.name, "o1"), k.order());
        });
        await assertSucceeds(
          setDoc(doc(asUser("dana"), k.name, "o1", "private", "data"), {
            buyerName: "Dana", amount: 4500,
          }),
        );
        await assertSucceeds(
          getDoc(doc(asUser("bob"), k.name, "o1", "private", "data")),
        );
        await assertFails(
          getDoc(doc(asUser("mallory"), k.name, "o1", "private", "data")),
        );
      });

      it("DENIES the school stamping a FORGED confirmedBy (audit actor binding) (#N6)", async () => {
        await seed(async (db) => {
          await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob", VERIFIED));
          await setDoc(doc(db, k.name, "o1"), k.order());
        });
        await assertFails(
          updateDoc(doc(asUser("bob"), k.name, "o1"), {
            status: "confirmed", confirmedAt: new Date(), confirmedBy: "someone-else",
            updatedAt: new Date(),
          }),
        );
      });

      it("DENIES the buyer stamping confirmedBy on their own pending order (#N6)", async () => {
        await seed(async (db) => {
          await setDoc(doc(db, "schools", "sch1"), schoolDoc("bob", VERIFIED));
          await setDoc(doc(db, k.name, "o1"), k.order());
        });
        await assertFails(
          updateDoc(doc(asUser("dana"), k.name, "o1"), {
            confirmedBy: "dana", updatedAt: new Date(),
          }),
        );
      });
    });
  }
});

// ── raffle create is function-only + school moderation (#N1: grid-lock DoS) ──
describe("raffle create denied to clients + school moderation (#N1)", () => {
  const VERIFIED = { verified: true, verificationStatus: "verified" };
  const raffleOrder = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    toolId: "tool1",
    toolTitle: "Rifa",
    buyerId: "dana",
    numbers: [1, 2],
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    ...over,
  });

  beforeEach(async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1"), schoolDoc("bob", VERIFIED)),
    );
  });

  it("DENIES any client create — reservations go through the reserveRaffleNumbers function (#N1)", async () => {
    // The arbiter (Admin SDK) is the sole creator; a scripted client can't write a raffleOrders doc
    // directly, so number uniqueness + the per-buyer cap can't be bypassed. Even a well-formed,
    // within-cap payload against a verified school is refused at the rules layer.
    await assertFails(
      addDoc(collection(asUser("dana"), "raffleOrders"), raffleOrder({ numbers: [1, 2, 3] })),
    );
  });

  it("ALLOWS the TARGET SCHOOL to delete an order it hosts (moderate spam/griefing)", async () => {
    await seed((db) => setDoc(doc(db, "raffleOrders", "o1"), raffleOrder()));
    await assertSucceeds(deleteDoc(doc(asUser("bob"), "raffleOrders", "o1")));
  });

  it("ALLOWS the buyer to delete their own order; DENIES a stranger", async () => {
    await seed((db) => setDoc(doc(db, "raffleOrders", "o1"), raffleOrder()));
    await assertSucceeds(deleteDoc(doc(asUser("dana"), "raffleOrders", "o1")));
    await seed((db) => setDoc(doc(db, "raffleOrders", "o2"), raffleOrder()));
    await assertFails(deleteDoc(doc(asUser("mallory"), "raffleOrders", "o2")));
  });
});

// ── bingo live event (state) + claims ────────────────────────────────────────
describe("bingo live event state — public read, school-only write", () => {
  beforeEach(async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      ),
    );
  });

  it("ALLOWS anyone to read the live board", async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1", "tools", "tool1", "event", "state"), {
        status: "live",
        calledNumbers: [5, 12],
        awardedPatterns: [],
        updatedAt: new Date(),
      }),
    );
    await assertSucceeds(
      getDoc(doc(asAnon(), "schools", "sch1", "tools", "tool1", "event", "state")),
    );
  });

  it("ALLOWS the school to drive the board, DENIES a stranger", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1", "event", "state"), {
        status: "live",
        calledNumbers: [],
        awardedPatterns: [],
        updatedAt: new Date(),
      }),
    );
    await assertFails(
      setDoc(
        doc(asUser("mallory"), "schools", "sch1", "tools", "tool1", "event", "state"),
        { status: "live", calledNumbers: [99], awardedPatterns: [], updatedAt: new Date() },
      ),
    );
  });
});

describe("bingo claims — owner-only create, school-only resolve", () => {
  const claim = (over: Record<string, unknown> = {}) => ({
    cardId: "card1",
    cardLabel: "001",
    patternId: "line",
    patternName: "Línea",
    claimantId: "dana",
    claimantName: "Dana",
    status: "pending",
    resolvedAt: null,
    createdAt: new Date(),
    ...over,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(
        doc(db, "schools", "sch1"),
        schoolDoc("bob", { verified: true, verificationStatus: "verified" }),
      );
      // A cartón owned by dana (assigned on a confirmed order).
      await setDoc(doc(db, "schools", "sch1", "tools", "tool1", "cards", "card1"), {
        label: "001",
        numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        status: "sold",
        soldOrderId: "o1",
        ownerId: "dana",
        createdAt: new Date(),
      });
    });
  });

  it("ALLOWS the cartón owner to file a pending claim", async () => {
    await assertSucceeds(
      addDoc(
        collection(asUser("dana"), "schools", "sch1", "tools", "tool1", "claims"),
        claim(),
      ),
    );
  });

  it("DENIES someone who does not own the cartón", async () => {
    await assertFails(
      addDoc(
        collection(asUser("mallory"), "schools", "sch1", "tools", "tool1", "claims"),
        claim({ claimantId: "mallory", claimantName: "Mallory" }),
      ),
    );
  });

  it("DENIES creating a claim already 'confirmed' (must start pending)", async () => {
    await assertFails(
      addDoc(
        collection(asUser("dana"), "schools", "sch1", "tools", "tool1", "claims"),
        claim({ status: "confirmed" }),
      ),
    );
  });

  it("ALLOWS the school to resolve a claim, DENIES the claimant resolving their own", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1", "tools", "tool1", "claims", "c1"),
        claim(),
      ),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1", "claims", "c1"), {
        status: "confirmed",
        resolvedAt: new Date(),
        resolvedBy: "bob",
      }),
    );
    await assertFails(
      updateDoc(doc(asUser("dana"), "schools", "sch1", "tools", "tool1", "claims", "c1"), {
        status: "confirmed",
        resolvedAt: new Date(),
        resolvedBy: "dana",
      }),
    );
  });

  it("ALLOWS the claimant to read their own claim, DENIES a stranger", async () => {
    await seed((db) =>
      setDoc(
        doc(db, "schools", "sch1", "tools", "tool1", "claims", "c1"),
        claim(),
      ),
    );
    await assertSucceeds(
      getDoc(doc(asUser("dana"), "schools", "sch1", "tools", "tool1", "claims", "c1")),
    );
    await assertFails(
      getDoc(doc(asUser("mallory"), "schools", "sch1", "tools", "tool1", "claims", "c1")),
    );
  });

  it("DENIES a claim with an oversize claimantName (#N6)", async () => {
    await assertFails(
      addDoc(
        collection(asUser("dana"), "schools", "sch1", "tools", "tool1", "claims"),
        claim({ claimantName: "x".repeat(81) }),
      ),
    );
  });

  it("DENIES a claim carrying an extra field (field set pinned) (#N6)", async () => {
    await assertFails(
      addDoc(
        collection(asUser("dana"), "schools", "sch1", "tools", "tool1", "claims"),
        claim({ resolvedBy: "dana" }),
      ),
    );
  });

  it("DENIES the school resolving with a FORGED resolvedBy (must be the actor) (#N6)", async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1", "tools", "tool1", "claims", "c1"), claim()),
    );
    await assertFails(
      updateDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1", "claims", "c1"), {
        status: "confirmed",
        resolvedAt: new Date(),
        resolvedBy: "someone-else",
      }),
    );
  });
});

// ── event tool (type: 'event') doc write-shape ───────────────────────────────
describe("event tool — owner-only create with an event config map", () => {
  const eventTool = (over: Record<string, unknown> = {}) => ({
    schoolId: "sch1",
    schoolName: "Escuela",
    type: "event",
    title: "Feria de la escuela",
    description: "¡Ven!",
    status: "active",
    config: { place: "Gimnasio" },
    ownerId: "bob",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, "schools", "sch1"), schoolDoc("bob")));
  });

  it("ALLOWS the school owner to create an event tool", async () => {
    await assertSucceeds(
      setDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1"), eventTool()),
    );
  });

  it("DENIES a stranger creating an event tool", async () => {
    await assertFails(
      setDoc(
        doc(asUser("mallory"), "schools", "sch1", "tools", "tool1"),
        eventTool(),
      ),
    );
  });

  it("DENIES an unknown extra field (write-shape pin)", async () => {
    await assertFails(
      setDoc(
        doc(asUser("bob"), "schools", "sch1", "tools", "tool1"),
        eventTool({ bogus: true }),
      ),
    );
  });

  it("ALLOWS the owner to update the event config map", async () => {
    await seed((db) =>
      setDoc(doc(db, "schools", "sch1", "tools", "tool1"), eventTool()),
    );
    await assertSucceeds(
      updateDoc(doc(asUser("bob"), "schools", "sch1", "tools", "tool1"), {
        config: { place: "Patio", photos: ["https://x/p.jpg"] },
        updatedAt: new Date(),
      }),
    );
  });
});
