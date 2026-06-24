/**
 * PRODUCTION demo seed for escuelaplace.com — a live-demo dataset written straight to the
 * real Firebase project with the Admin SDK (NOT the emulators).
 *
 * Scope (deliberately limited to the "catalog + ranking + reviews" demo):
 *   - Categories (8) with accurate businessCount.
 *   - Schools (9) across all 7 provinces, in every verification state (verified / pending /
 *     needs_reverification) + a verified school with zero supporters (empty state). Private
 *     payment-methods subcollection included.
 *   - Businesses (16) in every lifecycle status (active / pending / draft / suspended), with
 *     varied discounts, contact richness, hours, tags and editors.
 *   - Support subscriptions (10) in every state: confirmed (fresh, decayed, renewed),
 *     expiring, expired, pending-with-proof, pending-without-proof.
 *   - Reviews (~31) on most active businesses (authors are never the business owner/editor).
 *
 * NOT seeded (out of the chosen scope): school projects, project contributions, donor
 * profiles, school "tools" (bingo/raffle/sale/service/event/tour), thank-yous, audit events.
 * The Cloud Functions create audit events / thank-yous on their own when they fire (see below).
 *
 * ── Ownership model (important) ───────────────────────────────────────────────
 * Every page is owned by the demo account (OWNER_EMAIL, default josewdr@gmail.com) OR by a
 * SYNTHETIC owner (a Firestore-only users/{uid} doc, never an Auth account). This split is
 * deliberate: in production the Cloud Functions ARE deployed and re-run on every write here,
 * and the ranking function applies an anti-fraud "self-dealing" gate — a business's support
 * only counts toward ranking when the supporting business and the confirming school DO NOT
 * share an administrator, AND the school is verified. If a single account owned everything,
 * all support would be self-dealt and the ranking (the platform's whole value prop) would
 * render empty. So:
 *   - josewdr owns a SHOWCASE subset to demo the panel: one well-supported school
 *     (esc-san-jose-centro) and one business (cafe-del-valle) that supports a DIFFERENT
 *     owner's school. None of josewdr's relationships are self-dealt.
 *   - Every other page belongs to a distinct synthetic owner, so all confirmed support
 *     crosses owners and counts for ranking, and reviews can be authored without hitting the
 *     "can't review your own business" rule.
 *
 * ── Cloud Functions interplay ─────────────────────────────────────────────────
 * This script PRECOMPUTES the function-maintained fields (ranking.score/totalDonated,
 * reviewStats, school.metrics, subscription.countsForRanking, category.businessCount) with the
 * same math as functions/src, so the data is correct the instant it lands — even before the
 * functions fire. When the functions ARE deployed they recompute the same values (and append
 * auditEvents / thankYous idempotently); the result converges to the same state.
 *
 * ── Safety ────────────────────────────────────────────────────────────────────
 *   - ADDITIVE: only ever `set`s its own fixed, known ids — it never deletes a collection and
 *     never touches data it didn't create. Re-running is idempotent.
 *   - Requires an explicit `--yes` confirmation to write to the cloud (a dry guard against
 *     accidental runs). `--check` validates the dataset offline and needs no credentials.
 *   - `--clean` removes ONLY the demo docs this script created (by their known ids).
 *
 * ── Credentials ───────────────────────────────────────────────────────────────
 * Uses Application Default Credentials (same as functions/scripts/set-admin.mjs). Either:
 *   - run `gcloud auth application-default login` with an account that has access to the
 *     project (Firestore + Auth Admin), or
 *   - set GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON.
 * The project id resolves from GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT / FIREBASE_PROJECT, else
 * the .firebaserc default ("escuelaplace").
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   node scripts/seed-prod.mjs --check         # validate the dataset offline (no creds, no writes)
 *   node scripts/seed-prod.mjs --yes           # seed the production project
 *   node scripts/seed-prod.mjs --clean --yes   # remove the demo docs this script created
 *   OWNER_EMAIL=me@gmail.com node scripts/seed-prod.mjs --yes
 *   OWNER_UID=<uid> node scripts/seed-prod.mjs --yes   # skip the Auth email lookup
 */
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, GeoPoint, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { geohashForLocation } from "geofire-common";

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const CLEAN = args.has("--clean");
const CONFIRMED = args.has("--yes") || args.has("-y");
const OWNER_EMAIL = process.env.OWNER_EMAIL || "josewdr@gmail.com";

/** Placeholder for the demo account's uid in the data below; resolved at runtime from Auth
 * (or OWNER_UID), and a stable dummy under --check (so integrity holds without credentials). */
const JOSE = "__OWNER_JOSE__";

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

const DAY_MS = 86_400_000;
const UNIT_CRC = 5000; // SUBSCRIPTION_UNIT_CRC
const PLAN_VALID_MS = 365 * DAY_MS;

// Fixed reference "now". A literal Date.now() is avoided so two runs on the same data produce
// the same timestamps relative to invocation; this is computed once per process.
const nowMs = Date.now();
const now = Timestamp.fromMillis(nowMs);

/** Timestamp `days` days in the past (negative = future). */
function daysAgo(days) {
  return Timestamp.fromMillis(nowMs - days * DAY_MS);
}

/** Location object with geopoint + geohash from lat/lng (all seed data is Costa Rican). */
function location(lat, lng, extra = {}) {
  return {
    geopoint: new GeoPoint(lat, lng),
    geohash: geohashForLocation([lat, lng]),
    country: "CR",
    ...extra,
  };
}

// ── Ranking math (mirror of functions/src/ranking.ts — keep in sync) ──────────
const WEIGHTS = {
  bi: 0.4,
  bq: 0.3,
  saturationUnits: 10,
  halfLifeDays: 180,
  reviewSaturationCount: 5,
};

/** Whether a subscription is currently "counting" (status + not lapsed). */
function isCounting(sub) {
  if (sub.status === "pending" || sub.status === "expired") return false;
  const exp = sub.expiresAt ? sub.expiresAt.toMillis() : null;
  return exp == null || exp > nowMs;
}

function qualityScore(stats) {
  if (!stats || stats.count <= 0) return 0;
  const avgNorm = Math.min(1, Math.max(0, (stats.average - 1) / 4));
  const confidence = Math.min(1, stats.count / WEIGHTS.reviewSaturationCount);
  return avgNorm * confidence;
}

/** Mission-general baseline persisted in business.ranking.score. `subs` must already be
 * filtered to the ranking-ELIGIBLE ones (verified school + no self-dealing), mirroring the
 * Cloud Function's anti-fraud gate. */
function baselineScore(eligibleSubs, reviewStats) {
  let units = 0;
  for (const s of eligibleSubs) {
    if (!isCounting(s)) continue;
    const confirmedMs = s.confirmedAt ? s.confirmedAt.toMillis() : null;
    const ageDays = confirmedMs == null ? 0 : Math.max(0, (nowMs - confirmedMs) / DAY_MS);
    units += s.units * Math.pow(0.5, ageDays / WEIGHTS.halfLifeDays);
  }
  const general = Math.min(1, Math.max(0, units) / WEIGHTS.saturationUnits);
  return 1 + WEIGHTS.bi * general + WEIGHTS.bq * qualityScore(reviewStats);
}

// ── Synthetic users (Firestore-only; never created in Auth) ───────────────────
// Owners of the non-showcase pages + a couple of page-less reviewers. josewdr is resolved
// separately and is NOT in this list.
const users = [
  { uid: "demo-owner-maria", name: "María Rodríguez", email: "maria@demo.escuelaplace.com", phone: "8800-0002" },
  { uid: "demo-owner-carlos", name: "Carlos Jiménez", email: "carlos@demo.escuelaplace.com", phone: "8800-0003" },
  { uid: "demo-owner-rosa", name: "Rosa Campos", email: "rosa@demo.escuelaplace.com" },
  { uid: "demo-owner-gabriela", name: "Gabriela Núñez", email: "gabriela@demo.escuelaplace.com" },
  { uid: "demo-owner-jorge", name: "Jorge Castro", email: "jorge@demo.escuelaplace.com", phone: "8800-0006" },
  { uid: "demo-owner-ana", name: "Ana Vargas", email: "ana@demo.escuelaplace.com", phone: "8800-0007" },
  { uid: "demo-owner-luis", name: "Luis Brenes", email: "luis@demo.escuelaplace.com" },
  { uid: "demo-owner-david", name: "David Chaves", email: "david@demo.escuelaplace.com" },
  { uid: "demo-owner-pablo", name: "Pablo Méndez", email: "pablo@demo.escuelaplace.com" },
  { uid: "demo-owner-karla", name: "Karla Fernández", email: "karla@demo.escuelaplace.com" },
  // Page-less reviewers (active "buyers" who left reviews; no Auth account).
  { uid: "demo-user-sofia", name: "Sofía Ramírez", email: "sofia@demo.escuelaplace.com" },
  { uid: "demo-user-elena", name: "Elena Mora", email: "elena@demo.escuelaplace.com" },
];

// ── Categories ────────────────────────────────────────────────────────────────
const categories = [
  { id: "comida", name: "Comida y Restaurantes", icon: "🍽️", order: 1 },
  { id: "panaderia", name: "Panaderías y Reposterías", icon: "🥐", order: 2 },
  { id: "salud", name: "Salud y Bienestar", icon: "💊", order: 3 },
  { id: "educacion", name: "Educación y Cursos", icon: "📚", order: 4 },
  { id: "servicios", name: "Servicios", icon: "🔧", order: 5 },
  { id: "tecnologia", name: "Tecnología y Celulares", icon: "💻", order: 6 },
  { id: "ropa", name: "Ropa y Accesorios", icon: "👕", order: 7 },
  { id: "ferreteria", name: "Ferreterías y Construcción", icon: "🧱", order: 8 },
];

// ── Schools ───────────────────────────────────────────────────────────────────
// josewdr owns esc-san-jose-centro (the showcase school). esc-escazu sits ~6 km from it so the
// location-based community resolution can pick up more than one school.
const schools = [
  {
    id: "esc-san-jose-centro",
    name: "Escuela Juan Rafael Mora Porras",
    description: "Escuela pública en el centro de San José, comprometida con la comunidad.",
    thankYouMessage: "¡Gracias por apoyar a nuestra escuela! Tu aporte hace la diferencia.",
    location: location(9.9325, -84.0791, { admin1: "San José", admin2: "San José", admin3: "Carmen" }),
    boardContact: { name: "Junta de Educación JRMP", phone: "8888-1111", email: "junta@esc-mora.cr" },
    paymentMethods: [
      { label: "SINPE Móvil", value: "8888-1111 (Junta de Educación JRMP)" },
      { label: "Cuenta bancaria (IBAN)", value: "CR05 0152 0200 1026 2840 66" },
      { label: "PayPal", value: "junta@esc-mora.cr" },
    ],
    verificationStatus: "verified",
    ownerId: JOSE, // SHOWCASE
    createdDaysAgo: 200,
  },
  {
    id: "esc-escazu",
    name: "Escuela Benjamín Herrera Angulo",
    description: "Escuela de Escazú centro, con más de 80 años de historia.",
    thankYouMessage: "Su apoyo se convierte en mejores aulas para nuestros niños.",
    location: location(9.9189, -84.1396, { admin1: "San José", admin2: "Escazú", admin3: "Escazú" }),
    boardContact: { name: "Junta de Educación Benjamín Herrera", phone: "8888-3333", email: "junta@esc-herrera.cr" },
    // LEGACY single-sinpe shape on purpose (exercises paymentMethodsOf's normalization).
    sinpe: { number: "8888-3333", accountHolder: "Junta de Educación Benjamín Herrera" },
    verificationStatus: "verified",
    ownerId: "demo-owner-maria",
    createdDaysAgo: 160,
  },
  {
    id: "esc-heredia-centro",
    name: "Escuela República de Argentina",
    description: "Institución educativa con fuerte vínculo con el comercio local.",
    thankYouMessage: "Cada comercio aliado nos ayuda a crecer. ¡Mil gracias!",
    location: location(9.9981, -84.1167, { admin1: "Heredia", admin2: "Heredia", admin3: "Heredia" }),
    boardContact: { name: "Junta de Educación Rep. Argentina", phone: "8888-2222", email: "junta@esc-argentina.cr" },
    paymentMethods: [{ label: "SINPE Móvil", value: "8888-2222 (Junta de Educación Rep. Argentina)" }],
    verificationStatus: "verified",
    ownerId: "demo-owner-carlos",
    createdDaysAgo: 190,
  },
  {
    id: "esc-alajuela-centro",
    name: "Escuela Ascensión Esquivel Ibarra",
    description: "Escuela centenaria frente al parque central de Alajuela.",
    thankYouMessage: "La comunidad alajuelense agradece su compromiso con la educación.",
    location: location(10.0163, -84.2117, { admin1: "Alajuela", admin2: "Alajuela", admin3: "Alajuela" }),
    boardContact: { name: "Junta de Educación Ascensión Esquivel", phone: "8888-4444", email: "junta@esc-esquivel.cr" },
    paymentMethods: [{ label: "SINPE Móvil", value: "8888-4444 (Junta de Educación Ascensión Esquivel)" }],
    verificationStatus: "verified",
    ownerId: "demo-owner-carlos",
    createdDaysAgo: 150,
  },
  {
    id: "esc-cartago-oriental",
    name: "Escuela Jesús Jiménez Zamora",
    description: "Escuela emblemática del distrito Oriental de Cartago.",
    thankYouMessage: "Gracias por invertir en el futuro de Cartago.",
    location: location(9.8644, -83.9194, { admin1: "Cartago", admin2: "Cartago", admin3: "Oriental" }),
    boardContact: { name: "Junta de Educación Jesús Jiménez", phone: "8888-5555", email: "junta@esc-jimenez.cr" },
    paymentMethods: [{ label: "SINPE Móvil", value: "8888-5555 (Junta de Educación Jesús Jiménez)" }],
    verificationStatus: "verified",
    ownerId: "demo-owner-rosa",
    createdDaysAgo: 140,
  },
  {
    id: "esc-limon-centro",
    name: "Escuela Tomás Guardia",
    description: "Escuela del centro de Limón, corazón educativo del Caribe.",
    thankYouMessage: "¡Pura vida! Su aporte fortalece a nuestra niñez caribeña.",
    location: location(9.9913, -83.036, { admin1: "Limón", admin2: "Limón", admin3: "Limón" }),
    boardContact: { name: "Junta de Educación Tomás Guardia", phone: "8888-6666", email: "junta@esc-guardia.cr" },
    paymentMethods: [{ label: "SINPE Móvil", value: "8888-6666 (Junta de Educación Tomás Guardia)" }],
    verificationStatus: "verified",
    ownerId: "demo-owner-rosa",
    createdDaysAgo: 120,
  },
  {
    // needs_reverification: was verified, then the owner edited the payment methods → banner shown,
    // payment data hidden until the admin re-approves. Its supporter's confirmed sub still counts
    // for the school's supporter metrics but NOT for the business's ranking (not verified).
    id: "esc-liberia",
    name: "Escuela Ascensión Esquivel (Liberia)",
    description: "Escuela del centro de Liberia, Guanacaste.",
    thankYouMessage: "La pampa guanacasteca le agradece su apoyo.",
    location: location(10.6346, -85.4407, { admin1: "Guanacaste", admin2: "Liberia", admin3: "Liberia" }),
    boardContact: { name: "Junta de Educación Liberia Centro", phone: "8888-7777", email: "junta@esc-liberia.cr" },
    paymentMethods: [{ label: "SINPE Móvil", value: "8888-7777 (Junta de Educación Liberia Centro)" }],
    verificationStatus: "needs_reverification",
    ownerId: "demo-owner-gabriela",
    createdDaysAgo: 110,
  },
  {
    // pending: just created by its owner, never verified. Payment data hidden + banner.
    id: "esc-puntarenas",
    name: "Escuela Delia Urbina de Guevara",
    description: "Escuela frente al estero de Puntarenas, recién unida a la plataforma.",
    thankYouMessage: "El Puerto agradece a los comercios que apoyan su escuela.",
    location: location(9.9762, -84.8384, { admin1: "Puntarenas", admin2: "Puntarenas", admin3: "Puntarenas" }),
    boardContact: { name: "Junta de Educación Delia Urbina", phone: "8888-8888", email: "junta@esc-delia.cr" },
    paymentMethods: [{ label: "SINPE Móvil", value: "8888-8888 (Junta de Educación Delia Urbina)" }],
    verificationStatus: "pending",
    ownerId: "demo-owner-jorge",
    createdDaysAgo: 3,
  },
  {
    // Verified school with ZERO supporting businesses (empty state in its public page).
    id: "esc-san-carlos-rural",
    name: "Escuela La Palmera",
    description: "Escuela rural de San Carlos, en la comunidad de La Palmera.",
    thankYouMessage: "En la zona norte, cada colón cuenta. ¡Gracias!",
    location: location(10.3236, -84.4297, { admin1: "Alajuela", admin2: "San Carlos", admin3: "La Palmera" }),
    boardContact: { name: "Junta de Educación La Palmera", phone: "8888-9999", email: "junta@esc-palmera.cr" },
    paymentMethods: [{ label: "SINPE Móvil", value: "8888-9999 (Junta de Educación La Palmera)" }],
    verificationStatus: "verified",
    ownerId: "demo-owner-rosa",
    createdDaysAgo: 90,
  },
];

// ── Businesses ────────────────────────────────────────────────────────────────
// Owners are chosen so that NO supporting business shares an administrator with the school it
// supports (otherwise the anti-fraud gate would drop it from ranking). josewdr owns
// cafe-del-valle, which supports a school owned by someone else.
const businesses = [
  {
    id: "soda-la-esquina",
    name: "Soda La Esquina",
    slug: "soda-la-esquina",
    description: "Comidas caseras costarricenses. Casados, gallos y refrescos naturales.",
    categories: ["comida"],
    tags: ["casado", "gallos", "almuerzo", "comida típica", "refrescos naturales"],
    schoolId: "esc-san-jose-centro",
    lat: 9.933, lng: -84.079, admin3: "Carmen",
    discount: { active: true, text: "10% en casados los lunes", percentage: 10 },
    contact: { whatsapp: "7000-1111", catalog: "7000-1111", phone: "2222-1111", instagram: "@sodalaesquina" },
    hours: "L–S 6:00–18:00",
    status: "active", verified: true,
    ownerId: "demo-owner-ana",
    metrics: { views: 320, interactions: 45 },
    createdDaysAgo: 180,
  },
  {
    id: "panaderia-el-trigal",
    name: "Panadería El Trigal",
    slug: "panaderia-el-trigal",
    description: "Pan fresco todos los días, repostería y café de altura.",
    categories: ["panaderia", "comida"],
    tags: ["pan", "repostería", "café", "queque", "baguette"],
    schoolId: "esc-san-jose-centro",
    lat: 9.931, lng: -84.08, admin3: "Carmen",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-2222", phone: "2222-2222" },
    hours: "L–D 5:30–19:00",
    status: "active", verified: true,
    ownerId: "demo-owner-luis",
    metrics: { views: 210, interactions: 30 },
    createdDaysAgo: 170,
  },
  {
    // Excellent non-supporter: no subscriptions but near-perfect reviews. Has a co-editor.
    id: "libreria-el-saber",
    name: "Librería El Saber",
    slug: "libreria-el-saber",
    description: "Libros, útiles escolares y fotocopias a un costado de la escuela.",
    categories: ["educacion", "servicios"],
    tags: ["cuadernos", "útiles escolares", "fotocopias", "libros", "lapiceros"],
    schoolId: "esc-san-jose-centro",
    lat: 9.934, lng: -84.078, admin3: "Carmen",
    discount: { active: true, text: "5% en útiles escolares en época de entrada a clases", percentage: 5 },
    contact: { whatsapp: "7000-3333", web: "https://elsaber.cr", facebook: "libreriaelsaber" },
    hours: "L–V 8:00–17:30, S 8:00–12:00",
    status: "active", verified: true,
    ownerId: "demo-owner-ana",
    editorIds: ["demo-user-elena"], // delegated co-administration (this business has no support edge)
    metrics: { views: 150, interactions: 22 },
    createdDaysAgo: 150,
  },
  {
    // Awaiting approval: not publicly listed.
    id: "tecnicell-sj",
    name: "TecniCell Reparaciones",
    slug: "tecnicell-reparaciones",
    description: "Reparación de celulares y venta de accesorios.",
    categories: ["tecnologia", "servicios"],
    tags: ["reparación de celulares", "pantallas", "accesorios"],
    schoolId: "esc-san-jose-centro",
    lat: 9.9335, lng: -84.0815, admin3: "Carmen",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-4444" },
    status: "pending", verified: false,
    ownerId: "demo-owner-david",
    metrics: { views: 0, interactions: 0 },
    createdDaysAgo: 2,
  },
  {
    id: "barberia-don-rafa",
    name: "Barbería Don Rafa",
    slug: "barberia-don-rafa",
    description: "Cortes clásicos y modernos. Atención con cita o por llegada.",
    categories: ["servicios"],
    tags: ["barbería", "corte de cabello", "barba"],
    schoolId: "esc-san-jose-centro",
    lat: 9.9318, lng: -84.0775, admin3: "Carmen",
    discount: { active: true, text: "₡1.000 de descuento a estudiantes", percentage: 0 },
    contact: { whatsapp: "7000-5555", instagram: "@donrafabarber" },
    hours: "M–S 9:00–19:00",
    status: "active", verified: false, // active but the admin hasn't granted the badge yet
    ownerId: "demo-owner-jorge",
    metrics: { views: 95, interactions: 12 },
    createdDaysAgo: 60,
  },
  {
    // SHOWCASE business (josewdr): supports esc-escazu (owned by demo-owner-maria), so the
    // support counts for ranking, and josewdr can demo the business panel + a renewal nudge
    // (its support is `expiring`).
    id: "cafe-del-valle",
    name: "Café del Valle",
    slug: "cafe-del-valle",
    description: "Café de especialidad, repostería artesanal y brunch en Escazú.",
    categories: ["comida", "panaderia"],
    tags: ["café de especialidad", "brunch", "repostería", "desayunos"],
    schoolId: "esc-escazu",
    lat: 9.9195, lng: -84.1402, admin3: "Escazú",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-6666", instagram: "@cafedelvalle", web: "https://cafedelvalle.cr" },
    hours: "L–D 7:00–18:00",
    status: "active", verified: true,
    ownerId: JOSE, // SHOWCASE
    metrics: { views: 280, interactions: 51 },
    createdDaysAgo: 140,
  },
  {
    // Draft: still being filled in by its owner, not publicly listed.
    id: "gimnasio-activo",
    name: "Gimnasio Activo",
    slug: "gimnasio-activo",
    description: "Gimnasio familiar con clases grupales.",
    categories: ["salud"],
    tags: ["gimnasio", "clases grupales", "spinning"],
    schoolId: "esc-escazu",
    lat: 9.918, lng: -84.139, admin3: "Escazú",
    discount: { active: false, text: "" },
    contact: {},
    status: "draft", verified: false,
    ownerId: "demo-owner-david",
    metrics: { views: 0, interactions: 0 },
    createdDaysAgo: 5,
  },
  {
    // Strongest supporter: a big recent subscription to its community school plus a smaller one
    // to josewdr's school (so josewdr sees it in their confirmation history).
    id: "farmacia-vida-sana",
    name: "Farmacia Vida Sana",
    slug: "farmacia-vida-sana",
    description: "Medicamentos, productos de cuidado personal y asesoría farmacéutica.",
    categories: ["salud"],
    tags: ["farmacia", "medicamentos", "genéricos", "cuidado personal"],
    schoolId: "esc-heredia-centro",
    lat: 9.998, lng: -84.116, admin3: "Heredia",
    discount: { active: true, text: "5% presentando carné estudiantil", percentage: 5 },
    contact: { whatsapp: "7000-7777", phone: "2222-3333", web: "https://vidasana.cr" },
    hours: "L–D 7:00–21:00",
    status: "active", verified: true,
    ownerId: "demo-owner-luis",
    metrics: { views: 410, interactions: 77 },
    createdDaysAgo: 175,
  },
  {
    // Suspended (e.g. by the admin): not publicly listed.
    id: "pizzeria-la-toscana",
    name: "Pizzería La Toscana",
    slug: "pizzeria-la-toscana",
    description: "Pizza al horno de leña.",
    categories: ["comida"],
    tags: ["pizza", "horno de leña", "italiana"],
    schoolId: "esc-heredia-centro",
    lat: 9.999, lng: -84.118, admin3: "Heredia",
    discount: { active: false, text: "" },
    contact: { phone: "2222-8888" },
    status: "suspended", verified: false,
    ownerId: "demo-owner-david",
    metrics: { views: 60, interactions: 4 },
    createdDaysAgo: 100,
  },
  {
    // Low-rated business with a pending (unconfirmed) subscription + uploaded proof: shows the
    // school's confirmation queue and that pending support does NOT rank.
    id: "moda-urbana",
    name: "Moda Urbana",
    slug: "moda-urbana",
    description: "Ropa urbana para jóvenes y adultos. Nuevos estilos cada mes.",
    categories: ["ropa"],
    tags: ["ropa", "moda urbana", "jóvenes"],
    schoolId: "esc-heredia-centro",
    lat: 9.9975, lng: -84.115, admin3: "Heredia",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-8888", instagram: "@modaurbanacr", facebook: "modaurbanacr" },
    status: "active", verified: false,
    ownerId: "demo-owner-jorge",
    metrics: { views: 75, interactions: 8 },
    createdDaysAgo: 30,
  },
  {
    id: "ferreteria-central",
    name: "Ferretería Central Alajuela",
    slug: "ferreteria-central-alajuela",
    description: "Todo para la construcción y el hogar. Entregas a domicilio en el cantón.",
    categories: ["ferreteria", "servicios"],
    tags: ["ferretería", "construcción", "cemento", "herramientas", "pintura"],
    schoolId: "esc-alajuela-centro",
    lat: 10.017, lng: -84.213, admin3: "Alajuela",
    discount: { active: true, text: "Descuentos por volumen para juntas de educación", percentage: 0 },
    contact: { whatsapp: "7000-9999", phone: "2440-1111" },
    hours: "L–S 7:00–17:00",
    status: "active", verified: true,
    ownerId: "demo-owner-pablo",
    metrics: { views: 190, interactions: 25 },
    createdDaysAgo: 130,
  },
  {
    id: "veterinaria-patitas",
    name: "Veterinaria Patitas",
    slug: "veterinaria-patitas",
    description: "Consulta veterinaria, vacunación y peluquería canina.",
    categories: ["salud", "servicios"],
    tags: ["veterinaria", "vacunación", "peluquería canina", "mascotas"],
    schoolId: "esc-alajuela-centro",
    lat: 10.015, lng: -84.21, admin3: "Alajuela",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7100-1111", facebook: "vetpatitascr" },
    hours: "L–V 8:00–18:00",
    status: "active", verified: true,
    ownerId: "demo-owner-pablo",
    metrics: { views: 120, interactions: 14 },
    createdDaysAgo: 90,
  },
  {
    // Former supporter whose confirmation lapsed (expired subscription): supports the
    // renewal-nudge flows and shows decay back to baseline.
    id: "reposteria-dulce-tradicion",
    name: "Repostería Dulce Tradición",
    slug: "reposteria-dulce-tradicion",
    description: "Queques, arrollados y repostería fina cartaginesa por encargo.",
    categories: ["panaderia"],
    tags: ["repostería", "queques", "arrollados", "postres por encargo"],
    schoolId: "esc-cartago-oriental",
    lat: 9.865, lng: -83.92, admin3: "Oriental",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7100-2222", instagram: "@dulcetradicion" },
    status: "active", verified: true,
    ownerId: "demo-owner-karla",
    metrics: { views: 140, interactions: 19 },
    createdDaysAgo: 160,
  },
  {
    id: "marisqueria-el-puerto",
    name: "Marisquería El Puerto",
    slug: "marisqueria-el-puerto",
    description: "Ceviches, pescado entero y mariscos frescos frente al Paseo de los Turistas.",
    categories: ["comida"],
    tags: ["mariscos", "ceviche", "pescado", "comida del mar"],
    schoolId: "esc-puntarenas",
    lat: 9.9765, lng: -84.839, admin3: "Puntarenas",
    discount: { active: true, text: "Ceviche 2x1 los miércoles", percentage: 50 },
    contact: { whatsapp: "7100-3333", phone: "2661-1111" },
    hours: "M–D 11:00–21:00",
    status: "active", verified: true,
    ownerId: "demo-owner-pablo",
    metrics: { views: 230, interactions: 33 },
    createdDaysAgo: 80,
  },
  {
    // Pending subscription WITHOUT proof yet (just committed).
    id: "soda-caribe",
    name: "Soda Caribe",
    slug: "soda-caribe",
    description: "Rice and beans, pan bon y comida caribeña tradicional.",
    categories: ["comida"],
    tags: ["rice and beans", "pan bon", "comida caribeña", "limonense"],
    schoolId: "esc-limon-centro",
    lat: 9.992, lng: -83.037, admin3: "Limón",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7100-4444" },
    hours: "L–S 10:00–20:00",
    status: "active", verified: true,
    ownerId: "demo-owner-karla",
    metrics: { views: 88, interactions: 9 },
    createdDaysAgo: 70,
  },
  {
    // Supporter of a needs_reverification school (the sub was confirmed while verified). Its
    // support feeds the school's supporter metrics but NOT this business's ranking (gate).
    id: "academia-idiomas-guanacaste",
    name: "Academia de Idiomas Guanacaste",
    slug: "academia-idiomas-guanacaste",
    description: "Cursos de inglés y francés para niños y adultos en Liberia.",
    categories: ["educacion"],
    tags: ["inglés", "francés", "idiomas", "cursos"],
    schoolId: "esc-liberia",
    lat: 10.635, lng: -85.44, admin3: "Liberia",
    discount: { active: true, text: "Matrícula gratis para hijos de docentes", percentage: 0 },
    contact: { whatsapp: "7100-5555", web: "https://idiomasguanacaste.cr" },
    hours: "L–V 8:00–20:00, S 8:00–12:00",
    status: "active", verified: true,
    ownerId: "demo-owner-karla",
    metrics: { views: 160, interactions: 21 },
    createdDaysAgo: 95,
  },
];

// ── Subscriptions ─────────────────────────────────────────────────────────────
// `confirmedBy` is the destination school's owner (only the school/admin confirms). All are
// business supporters (supporterType: 'business'). amount = units × UNIT_CRC.
const subscriptions = [
  // Confirmed, fresh — and a RENEWAL (first confirmed ~100d ago, renewed 10d ago).
  { id: "sub-soda-sj", businessId: "soda-la-esquina", schoolId: "esc-san-jose-centro", units: 3, status: "confirmed", firstConfirmedDaysAgo: 100, confirmedDaysAgo: 10, expiresInDays: 80, confirmedBy: JOSE, proofUploaded: true, createdDaysAgo: 102 },
  // Confirmed, aging (decayed weight, still outside the expiring window).
  { id: "sub-trigal-sj", businessId: "panaderia-el-trigal", schoolId: "esc-san-jose-centro", units: 2, status: "confirmed", confirmedDaysAgo: 74, expiresInDays: 16, confirmedBy: JOSE, proofUploaded: true, createdDaysAgo: 75 },
  // Expiring (inside the 14-day renewal window; still counts). josewdr's own business.
  { id: "sub-cafe-escazu", businessId: "cafe-del-valle", schoolId: "esc-escazu", units: 2, status: "expiring", confirmedDaysAgo: 80, expiresInDays: 10, confirmedBy: "demo-owner-maria", proofUploaded: true, createdDaysAgo: 82 },
  // Strong community supporter + a second subscription to josewdr's school.
  { id: "sub-farmacia-heredia", businessId: "farmacia-vida-sana", schoolId: "esc-heredia-centro", units: 8, status: "confirmed", confirmedDaysAgo: 20, expiresInDays: 70, confirmedBy: "demo-owner-carlos", proofUploaded: true, createdDaysAgo: 21 },
  { id: "sub-farmacia-sj", businessId: "farmacia-vida-sana", schoolId: "esc-san-jose-centro", units: 2, status: "confirmed", confirmedDaysAgo: 45, expiresInDays: 45, confirmedBy: JOSE, proofUploaded: true, createdDaysAgo: 46 },
  // Pending WITH proof uploaded: sits in the school's confirmation queue.
  { id: "sub-moda-heredia", businessId: "moda-urbana", schoolId: "esc-heredia-centro", units: 1, status: "pending", proofUploaded: true, createdDaysAgo: 2 },
  // Confirmed in Alajuela.
  { id: "sub-ferreteria-alajuela", businessId: "ferreteria-central", schoolId: "esc-alajuela-centro", units: 5, status: "confirmed", confirmedDaysAgo: 30, expiresInDays: 60, confirmedBy: "demo-owner-carlos", proofUploaded: true, createdDaysAgo: 31 },
  // Expired (lapsed 60 days ago — no longer counts; renewal nudge in the panel).
  { id: "sub-reposteria-cartago", businessId: "reposteria-dulce-tradicion", schoolId: "esc-cartago-oriental", units: 4, status: "expired", confirmedDaysAgo: 150, expiresInDays: -60, confirmedBy: "demo-owner-rosa", proofUploaded: true, createdDaysAgo: 152 },
  // Pending WITHOUT proof (just committed, nothing uploaded yet).
  { id: "sub-sodacaribe-limon", businessId: "soda-caribe", schoolId: "esc-limon-centro", units: 1, status: "pending", proofUploaded: false, createdDaysAgo: 1 },
  // Confirmed toward the needs_reverification school (counts for school metrics, not ranking).
  { id: "sub-academia-liberia", businessId: "academia-idiomas-guanacaste", schoolId: "esc-liberia", units: 6, status: "confirmed", confirmedDaysAgo: 40, expiresInDays: 50, confirmedBy: "demo-owner-gabriela", proofUploaded: true, createdDaysAgo: 41 },
];

// ── Reviews ───────────────────────────────────────────────────────────────────
// businesses/{id}/reviews/{authorUid}. Authors are NEVER the business owner/editor (enforced
// by assertIntegrity below, mirroring the firestore rule).
const reviews = [
  { businessId: "soda-la-esquina", authorId: "demo-owner-luis", rating: 5, daysAgo: 40, text: "El casado de pollo es buenísimo y el precio justo." },
  { businessId: "soda-la-esquina", authorId: "demo-user-sofia", rating: 4, daysAgo: 25, text: "Rico y rápido, aunque a mediodía se llena mucho." },
  { businessId: "soda-la-esquina", authorId: "demo-user-elena", rating: 5, daysAgo: 12, text: "Atención de primera, se siente como comer en casa." },
  { businessId: "soda-la-esquina", authorId: "demo-owner-david", rating: 4, daysAgo: 5, text: "Buenos gallos y refrescos naturales." },

  { businessId: "panaderia-el-trigal", authorId: "demo-owner-ana", rating: 4, daysAgo: 50, text: "El pan baguette siempre fresco." },
  { businessId: "panaderia-el-trigal", authorId: "demo-user-sofia", rating: 5, daysAgo: 30, text: "La mejor repostería del centro." },
  { businessId: "panaderia-el-trigal", authorId: "demo-owner-jorge", rating: 4, daysAgo: 8, text: "Buen café y queque de elote delicioso." },

  // josewdr left this review — shows the "tu reseña" mark for the demo account.
  { businessId: "libreria-el-saber", authorId: JOSE, rating: 5, daysAgo: 70, text: "Tienen de todo para la entrada a clases, muy recomendada." },
  { businessId: "libreria-el-saber", authorId: "demo-owner-luis", rating: 5, daysAgo: 60, text: "Conseguí todo en un solo lugar." },
  { businessId: "libreria-el-saber", authorId: "demo-user-sofia", rating: 5, daysAgo: 45, text: "Precios justos y muy amables." },
  { businessId: "libreria-el-saber", authorId: "demo-owner-maria", rating: 5, daysAgo: 33, text: "Me consiguieron un libro que nadie más tenía." },
  { businessId: "libreria-el-saber", authorId: "demo-owner-jorge", rating: 5, daysAgo: 20, text: "Fotocopias baratas y rápidas." },
  { businessId: "libreria-el-saber", authorId: "demo-owner-karla", rating: 5, daysAgo: 15, text: "Excelente surtido de útiles." },
  { businessId: "libreria-el-saber", authorId: "demo-owner-david", rating: 4, daysAgo: 7, text: "Muy completo, parqueo difícil eso sí." },

  { businessId: "farmacia-vida-sana", authorId: "demo-owner-ana", rating: 4, daysAgo: 55, text: "Siempre tienen lo que busco." },
  { businessId: "farmacia-vida-sana", authorId: "demo-user-sofia", rating: 4, daysAgo: 38, text: "Buen servicio y descuento con carné." },
  { businessId: "farmacia-vida-sana", authorId: "demo-user-elena", rating: 5, daysAgo: 22, text: "La farmacéutica explica todo con paciencia." },
  { businessId: "farmacia-vida-sana", authorId: "demo-owner-maria", rating: 4, daysAgo: 14, text: "Abren hasta tarde, muy conveniente." },
  { businessId: "farmacia-vida-sana", authorId: "demo-owner-jorge", rating: 4, daysAgo: 6, text: "Buenos precios en genéricos." },

  { businessId: "cafe-del-valle", authorId: "demo-user-sofia", rating: 5, daysAgo: 18, text: "El mejor capuccino de Escazú." },
  { businessId: "cafe-del-valle", authorId: "demo-owner-luis", rating: 4, daysAgo: 9, text: "Brunch muy bueno, algo caro." },

  { businessId: "ferreteria-central", authorId: "demo-owner-luis", rating: 4, daysAgo: 28, text: "Entregaron el material el mismo día." },
  { businessId: "ferreteria-central", authorId: "demo-owner-david", rating: 5, daysAgo: 11, text: "Asesoría honesta, no venden de más." },

  { businessId: "soda-caribe", authorId: "demo-user-sofia", rating: 4, daysAgo: 16, text: "El rice and beans con pollo caribeño es otra cosa." },
  { businessId: "soda-caribe", authorId: "demo-owner-pablo", rating: 5, daysAgo: 4, text: "Auténtica comida limonense." },

  // Mixed/low ratings.
  { businessId: "academia-idiomas-guanacaste", authorId: "demo-user-sofia", rating: 3, daysAgo: 70, text: "Buenos profes pero grupos muy grandes." },
  { businessId: "academia-idiomas-guanacaste", authorId: "demo-owner-luis", rating: 3, daysAgo: 50, text: "El horario cambia mucho." },
  { businessId: "academia-idiomas-guanacaste", authorId: "demo-owner-ana", rating: 4, daysAgo: 35, text: "Mi hijo mejoró mucho su inglés." },
  { businessId: "academia-idiomas-guanacaste", authorId: "demo-owner-david", rating: 3, daysAgo: 19, text: "Está bien, esperaba más conversación." },
  { businessId: "academia-idiomas-guanacaste", authorId: "demo-user-elena", rating: 3, daysAgo: 10, text: "Material algo desactualizado." },

  { businessId: "moda-urbana", authorId: "demo-user-sofia", rating: 2, daysAgo: 13, text: "Las tallas no corresponden a lo etiquetado." },
  { businessId: "moda-urbana", authorId: "demo-owner-ana", rating: 3, daysAgo: 3, text: "Variedad bien, calidad regular." },
];

// ── Derived helpers ─────────────────────────────────────────────────────────

/** Replace the JOSE placeholder with the resolved uid throughout the dataset. */
function resolveOwners(joseUid) {
  const map = (uid) => (uid === JOSE ? joseUid : uid);
  for (const s of schools) {
    s.ownerId = map(s.ownerId);
    if (s.editorIds) s.editorIds = s.editorIds.map(map);
  }
  for (const b of businesses) {
    b.ownerId = map(b.ownerId);
    if (b.editorIds) b.editorIds = b.editorIds.map(map);
  }
  for (const sub of subscriptions) {
    if (sub.confirmedBy) sub.confirmedBy = map(sub.confirmedBy);
  }
  for (const r of reviews) r.authorId = map(r.authorId);
}

/** Administrators of a page (owner + editors). */
function principalsOf(page) {
  return new Set([page.ownerId, ...(page.editorIds ?? [])]);
}

/** Whether a subscription is ranking-ELIGIBLE: target school verified AND the supporting
 * business shares no administrator with it (mirror of the Cloud Function's anti-fraud gate). */
function eligibleForRanking(sub, businessById, schoolById) {
  const school = schoolById[sub.schoolId];
  const business = businessById[sub.businessId];
  if (!school || !business) return false;
  if (school.verificationStatus !== "verified") return false;
  const bP = principalsOf(business);
  for (const uid of principalsOf(school)) {
    if (bP.has(uid)) return false; // self-dealing
  }
  return true;
}

/** managedPages per uid, derived from ownerId/editorIds across businesses + schools. */
function buildManagedPages() {
  const byUid = new Map();
  const add = (uid, type, id, role) => {
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push({ type, id, role });
  };
  for (const b of businesses) {
    add(b.ownerId, "business", b.id, "owner");
    for (const uid of b.editorIds ?? []) add(uid, "business", b.id, "editor");
  }
  for (const s of schools) {
    add(s.ownerId, "school", s.id, "owner");
    for (const uid of s.editorIds ?? []) add(uid, "school", s.id, "editor");
  }
  return byUid;
}

/** reviewStats per business id, aggregated like the Cloud Function (count + mean). */
function buildReviewStats() {
  const byBusiness = new Map();
  for (const r of reviews) {
    const acc = byBusiness.get(r.businessId) ?? { count: 0, sum: 0 };
    acc.count += 1;
    acc.sum += r.rating;
    byBusiness.set(r.businessId, acc);
  }
  const stats = new Map();
  for (const [id, { count, sum }] of byBusiness) {
    stats.set(id, { count, average: sum / count });
  }
  return stats;
}

/** Materialize a subscription's Timestamps from the relative day offsets. */
function materializeSubscription(s) {
  const confirmed = s.confirmedDaysAgo != null;
  return {
    ...s,
    confirmedAt: confirmed ? daysAgo(s.confirmedDaysAgo) : null,
    firstConfirmedAt: confirmed ? daysAgo(s.firstConfirmedDaysAgo ?? s.confirmedDaysAgo) : null,
    expiresAt: confirmed ? daysAgo(-s.expiresInDays) : null,
  };
}

// ── Integrity assertions (run before any write; also the whole of --check) ────

/** Validate the dataset against the platform's invariants so a bad edit fails fast instead of
 * producing a subtly broken demo. Treats the JOSE placeholder as just another uid (it is not
 * resolved here — owner resolution happens once, later, with the real uid). */
function assertIntegrity() {
  const problems = [];
  const schoolIds = new Set(schools.map((s) => s.id));
  const knownUids = new Set([...users.map((u) => u.uid), JOSE]);
  const categoryIds = new Set(categories.map((c) => c.id));
  const businessById = Object.fromEntries(businesses.map((b) => [b.id, b]));
  const schoolById = Object.fromEntries(schools.map((s) => [s.id, s]));

  // Every business links a known school + known categories; owner/editors are known uids.
  for (const b of businesses) {
    if (!schoolIds.has(b.schoolId)) problems.push(`business ${b.id} → unknown school ${b.schoolId}`);
    if (!knownUids.has(b.ownerId)) problems.push(`business ${b.id} → unknown owner ${b.ownerId}`);
    for (const c of b.categories) if (!categoryIds.has(c)) problems.push(`business ${b.id} → unknown category ${c}`);
  }
  for (const s of schools) {
    if (!knownUids.has(s.ownerId)) problems.push(`school ${s.id} → unknown owner ${s.ownerId}`);
  }

  // Reviews: target business exists, known author, author is NOT the business owner/editor.
  for (const r of reviews) {
    const b = businessById[r.businessId];
    if (!b) { problems.push(`review → unknown business ${r.businessId}`); continue; }
    if (!knownUids.has(r.authorId)) problems.push(`review on ${r.businessId} → unknown author ${r.authorId}`);
    if (principalsOf(b).has(r.authorId)) {
      problems.push(`review on ${r.businessId} authored by its own owner/editor ${r.authorId} (rule violation)`);
    }
  }

  // Subscriptions: known business + school; confirmer is the school's owner/editor or absent.
  for (const sub of subscriptions) {
    const b = businessById[sub.businessId];
    const s = schoolById[sub.schoolId];
    if (!b) problems.push(`sub ${sub.id} → unknown business ${sub.businessId}`);
    if (!s) problems.push(`sub ${sub.id} → unknown school ${sub.schoolId}`);
    if (sub.confirmedBy && s && !principalsOf(s).has(sub.confirmedBy)) {
      problems.push(`sub ${sub.id} confirmedBy ${sub.confirmedBy} is not an admin of school ${sub.schoolId}`);
    }
    // A counting sub against a verified school must NOT be self-dealt (else ranking shows empty).
    if (b && s && isCounting(materializeSubscription(sub)) && s.verificationStatus === "verified") {
      if (!eligibleForRanking(sub, businessById, schoolById)) {
        problems.push(`sub ${sub.id} counts but is self-dealt against verified school ${sub.schoolId}`);
      }
    }
  }

  if (problems.length) {
    console.error("✖ Integrity check FAILED:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }
  console.log(
    `✔ Integrity OK — ${categories.length} categorías, ${schools.length} escuelas, ` +
      `${businesses.length} comercios, ${subscriptions.length} suscripciones, ${reviews.length} reseñas, ` +
      `${users.length} usuarios sintéticos (+ josewdr).`,
  );
}

// ── Build the docs to write (returns a flat list of {ref-spec, data}) ─────────

function buildSeed(joseUid, joseName) {
  const subs = subscriptions.map(materializeSubscription);
  const reviewStatsById = buildReviewStats();
  const managedPagesByUid = buildManagedPages();
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const schoolById = Object.fromEntries(schools.map((s) => [s.id, s]));
  const businessById = Object.fromEntries(businesses.map((b) => [b.id, b]));
  const userNameByUid = Object.fromEntries(users.map((u) => [u.uid, u.name]));
  userNameByUid[joseUid] = joseName;

  // Categories (businessCount = active businesses in the category).
  const countByCategory = {};
  for (const b of businesses) {
    if (b.status !== "active") continue;
    for (const c of b.categories) countByCategory[c] = (countByCategory[c] || 0) + 1;
  }

  /** Subscriptions per school that currently "count" (for school metrics). */
  const countingBySchool = new Map();
  for (const s of subs) {
    if (!isCounting(s)) continue;
    if (!countingBySchool.has(s.schoolId)) countingBySchool.set(s.schoolId, new Set());
    countingBySchool.get(s.schoolId).add(s.businessId);
  }

  return {
    subs,
    categories: categories.map((c) => ({
      id: c.id,
      data: { name: c.name, icon: c.icon, order: c.order, businessCount: countByCategory[c.id] || 0 },
    })),
    schools: schools.map((s) => {
      const supporters = countingBySchool.get(s.id) ?? new Set();
      return {
        id: s.id,
        data: {
          name: s.name,
          description: s.description,
          thankYouMessage: s.thankYouMessage,
          location: s.location,
          boardContact: s.boardContact,
          status: "active",
          verified: s.verificationStatus === "verified",
          verificationStatus: s.verificationStatus,
          metrics: { supportingBusinesses: supporters.size, uniqueSupporters: supporters.size },
          ownerId: s.ownerId,
          ...(s.editorIds ? { editorIds: s.editorIds } : {}),
          createdAt: daysAgo(s.createdDaysAgo),
          updatedAt: now,
        },
        private: s.paymentMethods ? { paymentMethods: s.paymentMethods } : { sinpe: s.sinpe },
      };
    }),
    businesses: businesses.map((b) => {
      const school = schoolById[b.schoolId];
      const bSubs = subs.filter((s) => s.businessId === b.id);
      const eligibleSubs = bSubs.filter((s) => eligibleForRanking(s, businessById, schoolById));
      const reviewStats = reviewStatsById.get(b.id) ?? { count: 0, average: 0 };
      const totalDonated = bSubs.filter((s) => s.confirmedAt).reduce((acc, s) => acc + s.units * UNIT_CRC, 0);
      return {
        id: b.id,
        data: {
          name: b.name,
          slug: b.slug,
          description: b.description,
          categories: b.categories,
          categoryNames: b.categories.map((c) => categoryNameById[c]),
          location: location(b.lat, b.lng, {
            address: `${b.admin3}, ${school.location.admin2}`,
            admin1: school.location.admin1,
            admin2: school.location.admin2,
            admin3: b.admin3,
          }),
          schoolId: b.schoolId,
          schoolName: school.name,
          contact: b.contact,
          discount: b.discount,
          ...(b.hours ? { hours: b.hours } : {}),
          photos: [],
          tags: b.tags ?? [],
          status: b.status,
          verified: b.verified,
          subscription: {
            active: b.status === "active",
            plan: "demo",
            validUntil: Timestamp.fromMillis(nowMs + PLAN_VALID_MS),
          },
          ranking: { score: baselineScore(eligibleSubs, reviewStats), totalDonated },
          metrics: b.metrics,
          reviewStats,
          ownerId: b.ownerId,
          ...(b.editorIds ? { editorIds: b.editorIds } : {}),
          createdAt: daysAgo(b.createdDaysAgo),
          updatedAt: now,
        },
      };
    }),
    reviews: reviews.map((r) => {
      const created = daysAgo(r.daysAgo);
      return {
        businessId: r.businessId,
        authorId: r.authorId,
        data: {
          authorId: r.authorId,
          authorName: userNameByUid[r.authorId] ?? "Usuario",
          rating: r.rating,
          text: r.text,
          createdAt: created,
          updatedAt: created,
        },
      };
    }),
    subscriptions: subs.map((s) => ({
      id: s.id,
      data: {
        supporterType: "business",
        businessId: s.businessId,
        businessName: businessById[s.businessId].name,
        schoolId: s.schoolId,
        schoolName: schoolById[s.schoolId].name,
        units: s.units,
        amount: s.units * UNIT_CRC,
        status: s.status,
        confirmedAt: s.confirmedAt,
        firstConfirmedAt: s.firstConfirmedAt,
        expiresAt: s.expiresAt,
        ...(s.confirmedBy ? { confirmedBy: s.confirmedBy } : {}),
        countsForRanking: eligibleForRanking(s, businessById, schoolById),
        proofUploaded: s.proofUploaded,
        createdAt: daysAgo(s.createdDaysAgo),
        updatedAt: now,
      },
    })),
    users: users.map((u) => ({
      uid: u.uid,
      data: {
        name: u.name,
        email: u.email,
        ...(u.phone ? { phone: u.phone } : {}),
        role: "user",
        managedPages: managedPagesByUid.get(u.uid) ?? [],
        createdAt: daysAgo(120),
      },
    })),
    joseManagedPages: managedPagesByUid.get(joseUid) ?? [],
  };
}

// ── Cloud write / clean ───────────────────────────────────────────────────────

async function resolveJose(auth) {
  if (process.env.OWNER_UID) return { uid: process.env.OWNER_UID, name: process.env.OWNER_NAME || "José" };
  try {
    const u = await auth.getUserByEmail(OWNER_EMAIL);
    return { uid: u.uid, name: u.displayName || OWNER_EMAIL.split("@")[0] };
  } catch (err) {
    console.error(
      `✖ No encontré la cuenta ${OWNER_EMAIL} en Firebase Auth del proyecto ${PROJECT_ID}.\n` +
        "  Inicia sesión una vez en la app de producción con esa cuenta (o pasa OWNER_UID=<uid>) y reintenta.\n" +
        `  Detalle: ${err.message}`,
    );
    process.exit(1);
  }
}

async function runSeed(db, seed, joseUid, joseName) {
  // Commit in chunks (a batch caps at 500 writes; we're well under, but stay tidy).
  const batch = db.batch();

  for (const c of seed.categories) batch.set(db.collection("categories").doc(c.id), c.data);

  for (const s of seed.schools) {
    const ref = db.collection("schools").doc(s.id);
    batch.set(ref, s.data);
    batch.set(ref.collection("private").doc("data"), s.private);
  }

  for (const b of seed.businesses) batch.set(db.collection("businesses").doc(b.id), b.data);

  for (const r of seed.reviews) {
    batch.set(db.collection("businesses").doc(r.businessId).collection("reviews").doc(r.authorId), r.data);
  }

  for (const s of seed.subscriptions) batch.set(db.collection("subscriptions").doc(s.id), s.data);

  for (const u of seed.users) batch.set(db.collection("users").doc(u.uid), u.data);

  await batch.commit();

  // josewdr's user doc: MERGE (don't clobber a real account). Union the demo managed pages with
  // whatever the account already manages; leave role/createdAt/name/email as they are.
  const joseRef = db.collection("users").doc(joseUid);
  const existing = (await joseRef.get()).data() ?? {};
  const existingPages = Array.isArray(existing.managedPages) ? existing.managedPages : [];
  const key = (p) => `${p.type}:${p.id}`;
  const merged = [...existingPages];
  const have = new Set(existingPages.map(key));
  for (const p of seed.joseManagedPages) if (!have.has(key(p))) { merged.push(p); have.add(key(p)); }
  const patch = { managedPages: merged };
  if (!existing.name) patch.name = joseName;
  if (!existing.email) patch.email = OWNER_EMAIL;
  if (!existing.role) patch.role = "user";
  if (!existing.createdAt) patch.createdAt = daysAgo(200);
  await joseRef.set(patch, { merge: true });

  console.log(
    `\n✔ Seed PROD OK (proyecto ${PROJECT_ID}) → ${seed.categories.length} categorías, ` +
      `${seed.schools.length} escuelas, ${seed.businesses.length} comercios, ` +
      `${seed.subscriptions.length} suscripciones, ${seed.reviews.length} reseñas, ` +
      `${seed.users.length} usuarios sintéticos.`,
  );
  printDemoGuide(joseUid);
}

async function runClean(db, joseUid) {
  // Deletes ONLY the demo docs this script creates, by their known ids (recursiveDelete on a
  // business/school doc also removes its subcollections: reviews / private / projects / tools).
  let deleted = 0;
  for (const b of businesses) { await db.recursiveDelete(db.collection("businesses").doc(b.id)); deleted++; }
  for (const s of schools) { await db.recursiveDelete(db.collection("schools").doc(s.id)); deleted++; }
  for (const sub of subscriptions) { await db.collection("subscriptions").doc(sub.id).delete(); deleted++; }
  for (const c of categories) { await db.collection("categories").doc(c.id).delete(); deleted++; }
  for (const u of users) { await db.collection("users").doc(u.uid).delete(); deleted++; }

  // josewdr's user doc: only strip the demo managed pages, never delete the account doc.
  const joseRef = db.collection("users").doc(joseUid);
  const existing = (await joseRef.get()).data();
  if (existing && Array.isArray(existing.managedPages)) {
    const demoBiz = new Set(businesses.map((b) => b.id));
    const demoSchool = new Set(schools.map((s) => s.id));
    const kept = existing.managedPages.filter(
      (p) => !((p.type === "business" && demoBiz.has(p.id)) || (p.type === "school" && demoSchool.has(p.id))),
    );
    await joseRef.set({ managedPages: kept }, { merge: true });
  }
  console.log(`\n✔ Clean OK (proyecto ${PROJECT_ID}) → ${deleted} docs demo eliminados (subcolecciones incluidas).`);
}

function printDemoGuide(joseUid) {
  console.log(
    [
      "",
      "── Guía de demo ───────────────────────────────────────────────",
      `Cuenta de demo (login con Google): ${OWNER_EMAIL}  [uid ${joseUid}]`,
      "  Posee: la escuela 'Escuela Juan Rafael Mora Porras' y el comercio 'Café del Valle'.",
      "",
      "URLs para mostrar:",
      "  /                                  Home: feed explorable + re-ranking al elegir escuela",
      "  /search?q=cuadernos                Búsqueda por palabras clave (tags)",
      "  /categories                        Índice de categorías con conteos",
      "  /school/esc-san-jose-centro        Escuela verificada con 3 comercios de apoyo",
      "  /school/esc-liberia                Escuela en 'needs_reverification' (banner + datos ocultos)",
      "  /school/esc-puntarenas             Escuela 'pending' (sin verificar)",
      "  /school/esc-san-carlos-rural       Escuela verificada SIN apoyos (empty state)",
      "  /business/farmacia-vida-sana       Comercio con apoyo fuerte (mejor ranking)",
      "  /business/cafe-del-valle           Comercio de josewdr (apoyo 'expiring' → renovación)",
      "  /panel                             Panel: las páginas que administra josewdr",
      "",
      "En el panel josewdr puede: confirmar la suscripción pendiente, ver la cola de apoyos,",
      "editar la escuela / métodos de pago, y administrar su comercio.",
      "",
      "Nota: si las Cloud Functions están desplegadas, recomputarán ranking/reseñas/métricas",
      "en segundos y anexarán auditEvents/thankYous; los valores convergen a los ya sembrados.",
      "Las páginas públicas son ISR (revalidan ~5 min): fuerza un refresh o espera para verlas.",
      "───────────────────────────────────────────────────────────────",
    ].join("\n"),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (CHECK_ONLY) {
    assertIntegrity();
    // Exercise the full build path offline (ranking math, anti-fraud eligibility, managedPages)
    // so a logic error surfaces here instead of mid-write. Keeps the JOSE placeholder as the
    // demo account's uid (owners are only resolved in the real run).
    const seed = buildSeed(JOSE, "José Demo");
    console.log(
      `✔ Build OK — josewdr administra ${seed.joseManagedPages.length} páginas ` +
        `(${seed.joseManagedPages.map((p) => `${p.type}:${p.id}`).join(", ")}).`,
    );
    const ranked = seed.businesses
      .filter((b) => b.data.status === "active")
      .map((b) => ({ id: b.id, score: b.data.ranking.score, donated: b.data.ranking.totalDonated }))
      .sort((a, b) => b.score - a.score);
    console.log("Ranking (comercios activos, score desc):");
    for (const r of ranked) {
      console.log(`  ${r.score.toFixed(4)}  ₡${r.donated.toLocaleString("es-CR")}\t${r.id}`);
    }
    console.log("\n(--check) Solo validación, no se escribió nada ni se usaron credenciales.");
    return;
  }

  // Validate the dataset BEFORE touching the cloud (resolves owners with a dummy uid). We
  // re-resolve with the real uid below.
  assertIntegrity();

  if (!CONFIRMED) {
    console.error(
      [
        "",
        `⚠  Esto escribiría datos de DEMO en el proyecto de PRODUCCIÓN: ${PROJECT_ID}`,
        `   Cuenta dueña del showcase: ${OWNER_EMAIL}`,
        `   Modo: ${CLEAN ? "LIMPIAR (borrar solo los docs demo)" : "SEMBRAR (aditivo, ids fijos)"}`,
        "",
        "   El seed es ADITIVO: solo escribe/borra sus propios ids conocidos, nunca otra data.",
        "   Para confirmar, reejecuta agregando  --yes",
        "",
        "   Credenciales: Application Default Credentials. Antes corre uno de:",
        "     gcloud auth application-default login",
        "     export GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccount.json   (PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS=...)",
        "",
      ].join("\n"),
    );
    process.exit(2);
  }

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();
  const auth = getAuth();

  const jose = await resolveJose(auth);
  // Resolve the dataset's JOSE placeholder to the REAL uid, once, after validation.
  resolveOwners(jose.uid);

  console.log(`→ Proyecto: ${PROJECT_ID}   Dueño showcase: ${OWNER_EMAIL} (${jose.uid})`);

  if (CLEAN) {
    await runClean(db, jose.uid);
  } else {
    const seed = buildSeed(jose.uid, jose.name);
    await runSeed(db, seed, jose.uid, jose.name);
  }
}

main().catch((err) => {
  console.error("Seed PROD falló:", err);
  process.exit(1);
});
