/**
 * One-time backfill for the BSRC-5 business-slug uniqueness reservations.
 *
 * BSRC-5 turns the slug a business publishes at /business/{slug} into a uniqueness primitive: every
 * NEW business creates a reservation doc `businessSlugs/{slug}` (id = slug) in the same batch, and the
 * business-create rule requires it (getAfter) while the reservation's create-only rule denies a second
 * claim of a held slug. That makes two businesses sharing a slug impossible — GOING FORWARD.
 *
 * Businesses created BEFORE the rule shipped have no reservation, so a new business could still grab a
 * legacy slug (the reservation create wouldn't collide with anything). This script closes that gap:
 * it walks every business and creates the missing `businessSlugs/{slug}` reservation (idempotent —
 * skips ones that already exist), so the hard guarantee covers the legacy catalog too. Run it ONCE
 * after deploying the BSRC-5 rules.
 *
 * With --prune it also deletes ORPHANED reservations — those whose `businessId` no longer points at a
 * live business (e.g. a deleted page) — so a deleted business's slug becomes reusable again.
 *
 * ── Safety ────────────────────────────────────────────────────────────────────
 *   - Dry-run by DEFAULT: prints what it WOULD write/delete and exits without touching Firestore.
 *     Pass --yes to actually write. (Reading the catalog still needs credentials.)
 *   - Uses Application Default Credentials. Authenticate first:
 *       gcloud auth application-default login         (or)
 *       set GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON.
 *
 * Usage:
 *   node scripts/backfill-business-slugs.mjs            # DRY RUN — report only, no writes
 *   node scripts/backfill-business-slugs.mjs --yes      # create the missing reservations
 *   node scripts/backfill-business-slugs.mjs --prune --yes   # also delete orphaned reservations
 */
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const CONFIRMED = args.has("--yes") || args.has("-y");
const PRUNE = args.has("--prune");

function resolveProjectId() {
  for (const k of ["GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "FIREBASE_PROJECT"]) {
    if (process.env[k]) return process.env[k];
  }
  try {
    const rc = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"));
    if (rc.projects?.default) return rc.projects.default;
  } catch {}
  return "escuelaplace";
}

const PROJECT_ID = resolveProjectId();
const BUSINESSES = "businesses";
const BUSINESS_SLUGS = "businessSlugs";

async function main() {
  console.log(`\nBSRC-5 slug backfill — project "${PROJECT_ID}" — ${CONFIRMED ? "WRITE" : "DRY RUN"}\n`);
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  const [businesses, reservations] = await Promise.all([
    db.collection(BUSINESSES).get(),
    db.collection(BUSINESS_SLUGS).get(),
  ]);

  const liveById = new Map(); // businessId -> { slug, ownerId }
  const slugToBusiness = new Map(); // slug -> businessId (to flag pre-existing collisions)
  let collisions = 0;
  for (const doc of businesses.docs) {
    const slug = doc.get("slug");
    const ownerId = doc.get("ownerId");
    if (typeof slug !== "string" || !slug) continue;
    liveById.set(doc.id, { slug, ownerId: typeof ownerId === "string" ? ownerId : "" });
    if (slugToBusiness.has(slug)) {
      collisions++;
      console.warn(
        `  ⚠  slug "${slug}" already on businesses ${slugToBusiness.get(slug)} AND ${doc.id} — ` +
          `a pre-existing duplicate; resolve manually (only one can hold the reservation).`,
      );
    } else {
      slugToBusiness.set(slug, doc.id);
    }
  }

  const reservedSlugs = new Set(reservations.docs.map((d) => d.id));

  // Missing reservations: a live business whose slug isn't reserved yet (and isn't a duplicate loser).
  const toCreate = [];
  for (const [slug, businessId] of slugToBusiness) {
    if (reservedSlugs.has(slug)) continue;
    const { ownerId } = liveById.get(businessId);
    toCreate.push({ slug, businessId, ownerId });
  }

  // Orphaned reservations: point at a businessId that no longer exists (only with --prune).
  const toPrune = [];
  if (PRUNE) {
    for (const r of reservations.docs) {
      const businessId = r.get("businessId");
      if (typeof businessId !== "string" || !liveById.has(businessId)) {
        toPrune.push(r.id);
      }
    }
  }

  console.log(
    `  businesses: ${businesses.size}  reservations: ${reservations.size}  ` +
      `pre-existing duplicates: ${collisions}`,
  );
  console.log(`  reservations to create: ${toCreate.length}`);
  if (PRUNE) console.log(`  orphaned reservations to prune: ${toPrune.length}`);

  if (!CONFIRMED) {
    console.log("\nDRY RUN — pass --yes to apply. No writes made.\n");
    return;
  }

  // Commit in chunks under the 500-write batch limit.
  const ops = [
    ...toCreate.map((r) => ({ kind: "set", ...r })),
    ...toPrune.map((slug) => ({ kind: "delete", slug })),
  ];
  let written = 0;
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 450)) {
      const ref = db.collection(BUSINESS_SLUGS).doc(op.slug);
      if (op.kind === "set") batch.set(ref, { businessId: op.businessId, ownerId: op.ownerId });
      else batch.delete(ref);
    }
    await batch.commit();
    written += Math.min(450, ops.length - i);
  }
  console.log(`\nDone — ${toCreate.length} created, ${PRUNE ? toPrune.length : 0} pruned (${written} writes).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
