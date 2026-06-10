/**
 * Seed script for the Firebase emulators (Firestore + Auth).
 *
 * Populates the full data model with realistic Costa Rican sample data covering the main
 * use cases, so every feature can be exercised in local development:
 *
 * - Categories (8) with accurate businessCount.
 * - Schools (9) across all 7 provinces, in every verification state:
 *   verified / pending / needs_reverification — plus a verified school with zero
 *   supporters (empty state). Private SINPE subcollection included.
 * - Businesses (16) in every lifecycle status (active / pending / draft / suspended),
 *   with varied discounts, contact richness, hours and editors.
 * - Users (13) covering the actor matrix: admin, multi-school board, multi-business
 *   owner, owner of both page types, editor-only, account with no pages, etc.
 *   Also imported into the AUTH emulator as Google accounts so you can sign in as them.
 * - Subscriptions (10) in every state: confirmed (fresh and decayed), expiring,
 *   expired, pending with proof, pending without proof.
 * - Reviews on ~9 businesses (authors never the owner/editor, per rules), with
 *   reviewStats aggregated exactly like the Cloud Function does.
 *
 * Derived fields (ranking.score, totalDonated, supportingBusinesses, businessCount,
 * reviewStats) are computed here with the same math as functions/src/ranking.ts, so the
 * data is consistent whether or not the functions emulator is running.
 *
 * Uses firebase-admin pointed at the emulators (FIRESTORE_EMULATOR_HOST /
 * FIREBASE_AUTH_EMULATOR_HOST), which bypasses security rules — that is why this never
 * touches production and needs no credentials.
 *
 * Run with the emulators up:  npm run seed
 */
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, GeoPoint, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { geohashForLocation } from "geofire-common";

// Safety: only run against the emulators, never against a real project.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}

/**
 * The emulator namespaces data by project id, so this MUST match the one the app uses
 * (NEXT_PUBLIC_FIREBASE_PROJECT_ID) or the seeded data is invisible to it. Resolution:
 * GCLOUD_PROJECT env → .env.local → .firebaserc default → demo fallback.
 */
function resolveProjectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const match = env.match(/^NEXT_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m);
    if (match && match[1].trim()) return match[1].trim();
  } catch {}
  try {
    const rc = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"));
    if (rc.projects?.default) return rc.projects.default;
  } catch {}
  return "demo-escuelaplace";
}

const PROJECT_ID = resolveProjectId();
initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

const DAY_MS = 86_400_000;
const now = Timestamp.now();
const nowMs = now.toMillis();

/** Timestamp `days` days in the past (negative = future). */
function daysAgo(days) {
  return Timestamp.fromMillis(nowMs - days * DAY_MS);
}

/** Build a Location object with geopoint + geohash from lat/lng. */
function location(lat, lng, extra = {}) {
  return {
    geopoint: new GeoPoint(lat, lng),
    geohash: geohashForLocation([lat, lng]),
    ...extra,
  };
}

// ── Ranking math (mirror of functions/src/ranking.ts — keep in sync) ──────────
const WEIGHTS = { bi: 0.4, bq: 0.3, saturationUnits: 10, halfLifeDays: 180, reviewSaturationCount: 5 };

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

/** Mission-general baseline persisted in business.ranking.score. */
function baselineScore(subs, reviewStats) {
  let units = 0;
  for (const s of subs) {
    if (!isCounting(s)) continue;
    const confirmedMs = s.confirmedAt ? s.confirmedAt.toMillis() : null;
    const ageDays = confirmedMs == null ? 0 : Math.max(0, (nowMs - confirmedMs) / DAY_MS);
    units += s.units * Math.pow(0.5, ageDays / WEIGHTS.halfLifeDays);
  }
  const general = Math.min(1, Math.max(0, units) / WEIGHTS.saturationUnits);
  return 1 + WEIGHTS.bi * general + WEIGHTS.bq * qualityScore(reviewStats);
}

// ── Users ─────────────────────────────────────────────────────────────────────
// Covers the actor matrix. All imported into the Auth emulator as Google accounts
// (sign in with their email from the emulator's account picker).
const users = [
  // Platform admin (verifies schools). No pages of their own.
  { uid: "usr-admin", name: "Adriana Solís", email: "admin@escuelaplace.test", role: "admin", phone: "8800-0001" },
  // Board member managing TWO school pages (multi-page, same type).
  { uid: "usr-maria", name: "María Rodríguez", email: "maria@escuelaplace.test", phone: "8800-0002" },
  // Board member of two schools in different provinces.
  { uid: "usr-carlos", name: "Carlos Jiménez", email: "carlos@escuelaplace.test", phone: "8800-0003" },
  // Board member of the eastern schools (Cartago, Limón) + the rural empty-state school.
  { uid: "usr-rosa", name: "Rosa Campos", email: "rosa@escuelaplace.test" },
  // Owner of the school stuck in needs_reverification.
  { uid: "usr-gabriela", name: "Gabriela Núñez", email: "gabriela@escuelaplace.test" },
  // Owns BOTH page types: a pending (unverified) school and businesses.
  { uid: "usr-jorge", name: "Jorge Castro", email: "jorge@escuelaplace.test", phone: "8800-0006" },
  // Multi-business owner (3 active businesses).
  { uid: "usr-ana", name: "Ana Vargas", email: "ana@escuelaplace.test", phone: "8800-0007" },
  // Business owner who also delegates: Elena is editor of his bakery.
  { uid: "usr-luis", name: "Luis Brenes", email: "luis@escuelaplace.test" },
  // Editor-only account: edits a business AND a school she doesn't own.
  { uid: "usr-elena", name: "Elena Mora", email: "elena@escuelaplace.test" },
  // Owner of non-active businesses (pending / draft / suspended lifecycle).
  { uid: "usr-david", name: "David Chaves", email: "david@escuelaplace.test" },
  // Business owners in the other provinces.
  { uid: "usr-pablo", name: "Pablo Méndez", email: "pablo@escuelaplace.test" },
  { uid: "usr-karla", name: "Karla Fernández", email: "karla@escuelaplace.test" },
  // Registered account with NO pages yet (empty panel state; active reviewer).
  { uid: "usr-sofia", name: "Sofía Ramírez", email: "sofia@escuelaplace.test" },
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
// All 7 provinces. verificationStatus covers the full lifecycle; esc-san-carlos-rural is
// the verified-but-no-supporters empty state. esc-escazu is ~6 km from esc-san-jose-centro
// so location-based community resolution can pick up more than one school.
const schools = [
  {
    id: "esc-san-jose-centro",
    name: "Escuela Juan Rafael Mora Porras",
    mepCode: "0123",
    description: "Escuela pública en el centro de San José, comprometida con la comunidad.",
    thankYouMessage: "¡Gracias por apoyar a nuestra escuela! Tu aporte hace la diferencia.",
    location: location(9.9325, -84.0791, { province: "San José", canton: "San José", district: "Carmen" }),
    boardContact: { name: "María Rodríguez", phone: "8888-1111", email: "junta@esc-mora.cr" },
    sinpe: { number: "8888-1111", accountHolder: "Junta de Educación JRMP" },
    verificationStatus: "verified",
    ownerId: "usr-maria",
    editorIds: ["usr-elena"],
    createdDaysAgo: 200,
  },
  {
    id: "esc-escazu",
    name: "Escuela Benjamín Herrera Angulo",
    mepCode: "0789",
    description: "Escuela de Escazú centro, con más de 80 años de historia.",
    thankYouMessage: "Su apoyo se convierte en mejores aulas para nuestros niños.",
    location: location(9.9189, -84.1396, { province: "San José", canton: "Escazú", district: "Escazú" }),
    boardContact: { name: "María Rodríguez", phone: "8888-3333", email: "junta@esc-herrera.cr" },
    sinpe: { number: "8888-3333", accountHolder: "Junta de Educación Benjamín Herrera" },
    verificationStatus: "verified",
    ownerId: "usr-maria",
    createdDaysAgo: 160,
  },
  {
    id: "esc-heredia-centro",
    name: "Escuela República de Argentina",
    mepCode: "0456",
    description: "Institución educativa con fuerte vínculo con el comercio local.",
    thankYouMessage: "Cada comercio aliado nos ayuda a crecer. ¡Mil gracias!",
    location: location(9.9981, -84.1167, { province: "Heredia", canton: "Heredia", district: "Heredia" }),
    boardContact: { name: "Carlos Jiménez", phone: "8888-2222", email: "junta@esc-argentina.cr" },
    sinpe: { number: "8888-2222", accountHolder: "Junta de Educación Rep. Argentina" },
    verificationStatus: "verified",
    ownerId: "usr-carlos",
    createdDaysAgo: 190,
  },
  {
    id: "esc-alajuela-centro",
    name: "Escuela Ascensión Esquivel Ibarra",
    mepCode: "1034",
    description: "Escuela centenaria frente al parque central de Alajuela.",
    thankYouMessage: "La comunidad alajuelense agradece su compromiso con la educación.",
    location: location(10.0163, -84.2117, { province: "Alajuela", canton: "Alajuela", district: "Alajuela" }),
    boardContact: { name: "Carlos Jiménez", phone: "8888-4444", email: "junta@esc-esquivel.cr" },
    sinpe: { number: "8888-4444", accountHolder: "Junta de Educación Ascensión Esquivel" },
    verificationStatus: "verified",
    ownerId: "usr-carlos",
    createdDaysAgo: 150,
  },
  {
    id: "esc-cartago-oriental",
    name: "Escuela Jesús Jiménez Zamora",
    mepCode: "2045",
    description: "Escuela emblemática del distrito Oriental de Cartago.",
    thankYouMessage: "Gracias por invertir en el futuro de Cartago.",
    location: location(9.8644, -83.9194, { province: "Cartago", canton: "Cartago", district: "Oriental" }),
    boardContact: { name: "Rosa Campos", phone: "8888-5555", email: "junta@esc-jimenez.cr" },
    sinpe: { number: "8888-5555", accountHolder: "Junta de Educación Jesús Jiménez" },
    verificationStatus: "verified",
    ownerId: "usr-rosa",
    createdDaysAgo: 140,
  },
  {
    id: "esc-limon-centro",
    name: "Escuela Tomás Guardia",
    mepCode: "3012",
    description: "Escuela del centro de Limón, corazón educativo del Caribe.",
    thankYouMessage: "¡Pura vida! Su aporte fortalece a nuestra niñez caribeña.",
    location: location(9.9913, -83.036, { province: "Limón", canton: "Limón", district: "Limón" }),
    boardContact: { name: "Rosa Campos", phone: "8888-6666", email: "junta@esc-guardia.cr" },
    sinpe: { number: "8888-6666", accountHolder: "Junta de Educación Tomás Guardia" },
    verificationStatus: "verified",
    ownerId: "usr-rosa",
    createdDaysAgo: 120,
  },
  {
    // needs_reverification: was verified, then the owner edited the SINPE → banner shown,
    // SINPE hidden until the admin re-approves.
    id: "esc-liberia",
    name: "Escuela Ascensión Esquivel (Liberia)",
    mepCode: "5021",
    description: "Escuela del centro de Liberia, Guanacaste.",
    thankYouMessage: "La pampa guanacasteca le agradece su apoyo.",
    location: location(10.6346, -85.4407, { province: "Guanacaste", canton: "Liberia", district: "Liberia" }),
    boardContact: { name: "Gabriela Núñez", phone: "8888-7777", email: "junta@esc-liberia.cr" },
    sinpe: { number: "8888-7777", accountHolder: "Junta de Educación Liberia Centro" },
    verificationStatus: "needs_reverification",
    ownerId: "usr-gabriela",
    createdDaysAgo: 110,
  },
  {
    // pending: just created by its owner, never verified. SINPE hidden + banner.
    id: "esc-puntarenas",
    name: "Escuela Delia Urbina de Guevara",
    mepCode: "6008",
    description: "Escuela frente al estero de Puntarenas, recién unida a la plataforma.",
    thankYouMessage: "El Puerto agradece a los comercios que apoyan su escuela.",
    location: location(9.9762, -84.8384, { province: "Puntarenas", canton: "Puntarenas", district: "Puntarenas" }),
    boardContact: { name: "Jorge Castro", phone: "8888-8888", email: "junta@esc-delia.cr" },
    sinpe: { number: "8888-8888", accountHolder: "Junta de Educación Delia Urbina" },
    verificationStatus: "pending",
    ownerId: "usr-jorge",
    createdDaysAgo: 3,
  },
  {
    // Verified school with ZERO supporting businesses (empty state in its public page).
    id: "esc-san-carlos-rural",
    name: "Escuela La Palmera",
    mepCode: "1290",
    description: "Escuela rural de San Carlos, en la comunidad de La Palmera.",
    thankYouMessage: "En la zona norte, cada colón cuenta. ¡Gracias!",
    location: location(10.3236, -84.4297, { province: "Alajuela", canton: "San Carlos", district: "La Palmera" }),
    boardContact: { name: "Rosa Campos", phone: "8888-9999", email: "junta@esc-palmera.cr" },
    sinpe: { number: "8888-9999", accountHolder: "Junta de Educación La Palmera" },
    verificationStatus: "verified",
    ownerId: "usr-rosa",
    createdDaysAgo: 90,
  },
];

// ── Businesses ────────────────────────────────────────────────────────────────
// Spread across provinces/schools/categories; covers every status, discount shape,
// contact richness, hours, editors, verified true/false.
const businesses = [
  {
    id: "soda-la-esquina",
    name: "Soda La Esquina",
    slug: "soda-la-esquina",
    description: "Comidas caseras costarricenses. Casados, gallos y refrescos naturales.",
    categories: ["comida"],
    schoolId: "esc-san-jose-centro",
    lat: 9.933, lng: -84.079, district: "Carmen",
    discount: { active: true, text: "10% en casados los lunes", percentage: 10 },
    contact: { whatsapp: "7000-1111", phone: "2222-1111", instagram: "@sodalaesquina" },
    hours: "L–S 6:00–18:00",
    status: "active", verified: true,
    ownerId: "usr-ana",
    metrics: { views: 320, interactions: 45 },
    createdDaysAgo: 180,
  },
  {
    id: "panaderia-el-trigal",
    name: "Panadería El Trigal",
    slug: "panaderia-el-trigal",
    description: "Pan fresco todos los días, repostería y café de altura.",
    categories: ["panaderia", "comida"],
    schoolId: "esc-san-jose-centro",
    lat: 9.931, lng: -84.08, district: "Carmen",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-2222", phone: "2222-2222" },
    hours: "L–D 5:30–19:00",
    status: "active", verified: true,
    ownerId: "usr-luis",
    editorIds: ["usr-elena"], // delegated co-administration
    metrics: { views: 210, interactions: 30 },
    createdDaysAgo: 170,
  },
  {
    // Excellent non-supporter: no subscriptions but near-perfect reviews — the calibrated
    // case where quality alone can edge out very weak supporters.
    id: "libreria-el-saber",
    name: "Librería El Saber",
    slug: "libreria-el-saber",
    description: "Libros, útiles escolares y fotocopias a un costado de la escuela.",
    categories: ["educacion", "servicios"],
    schoolId: "esc-san-jose-centro",
    lat: 9.934, lng: -84.078, district: "Carmen",
    discount: { active: true, text: "5% en útiles escolares en época de entrada a clases", percentage: 5 },
    contact: { whatsapp: "7000-3333", email: "info@elsaber.cr", web: "https://elsaber.cr", facebook: "libreriaelsaber" },
    hours: "L–V 8:00–17:30, S 8:00–12:00",
    status: "active", verified: true,
    ownerId: "usr-ana",
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
    schoolId: "esc-san-jose-centro",
    lat: 9.9335, lng: -84.0815, district: "Carmen",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-4444" },
    status: "pending", verified: false,
    ownerId: "usr-david",
    metrics: { views: 0, interactions: 0 },
    createdDaysAgo: 2,
  },
  {
    id: "barberia-don-rafa",
    name: "Barbería Don Rafa",
    slug: "barberia-don-rafa",
    description: "Cortes clásicos y modernos. Atención con cita o por llegada.",
    categories: ["servicios"],
    schoolId: "esc-san-jose-centro",
    lat: 9.9318, lng: -84.0775, district: "Carmen",
    discount: { active: true, text: "₡1.000 de descuento a estudiantes", percentage: 0 },
    contact: { whatsapp: "7000-5555", instagram: "@donrafabarber" },
    hours: "M–S 9:00–19:00",
    status: "active", verified: false, // active but the admin hasn't granted the badge yet
    ownerId: "usr-jorge",
    metrics: { views: 95, interactions: 12 },
    createdDaysAgo: 60,
  },
  {
    id: "cafe-del-valle",
    name: "Café del Valle",
    slug: "cafe-del-valle",
    description: "Café de especialidad, repostería artesanal y brunch en Escazú.",
    categories: ["comida", "panaderia"],
    schoolId: "esc-escazu",
    lat: 9.9195, lng: -84.1402, district: "Escazú",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-6666", instagram: "@cafedelvalle", web: "https://cafedelvalle.cr" },
    hours: "L–D 7:00–18:00",
    status: "active", verified: true,
    ownerId: "usr-ana",
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
    schoolId: "esc-escazu",
    lat: 9.918, lng: -84.139, district: "Escazú",
    discount: { active: false, text: "" },
    contact: {},
    status: "draft", verified: false,
    ownerId: "usr-david",
    metrics: { views: 0, interactions: 0 },
    createdDaysAgo: 5,
  },
  {
    // Strongest supporter: big recent subscription to its community school plus a smaller
    // one to a school outside it (C and I both non-zero depending on the viewer).
    id: "farmacia-vida-sana",
    name: "Farmacia Vida Sana",
    slug: "farmacia-vida-sana",
    description: "Medicamentos, productos de cuidado personal y asesoría farmacéutica.",
    categories: ["salud"],
    schoolId: "esc-heredia-centro",
    lat: 9.998, lng: -84.116, district: "Heredia",
    discount: { active: true, text: "5% presentando carné estudiantil", percentage: 5 },
    contact: { whatsapp: "7000-7777", phone: "2222-3333", web: "https://vidasana.cr", email: "hola@vidasana.cr" },
    hours: "L–D 7:00–21:00",
    status: "active", verified: true,
    ownerId: "usr-luis",
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
    schoolId: "esc-heredia-centro",
    lat: 9.999, lng: -84.118, district: "Heredia",
    discount: { active: false, text: "" },
    contact: { phone: "2222-8888" },
    status: "suspended", verified: false,
    ownerId: "usr-david",
    metrics: { views: 60, interactions: 4 },
    createdDaysAgo: 100,
  },
  {
    // Low-rated business with a pending (unconfirmed) subscription + uploaded proof:
    // shows the school's confirmation queue and that pending support does NOT rank.
    id: "moda-urbana",
    name: "Moda Urbana",
    slug: "moda-urbana",
    description: "Ropa urbana para jóvenes y adultos. Nuevos estilos cada mes.",
    categories: ["ropa"],
    schoolId: "esc-heredia-centro",
    lat: 9.9975, lng: -84.115, district: "Heredia",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-8888", instagram: "@modaurbanacr", facebook: "modaurbanacr" },
    status: "active", verified: false,
    ownerId: "usr-jorge",
    metrics: { views: 75, interactions: 8 },
    createdDaysAgo: 30,
  },
  {
    id: "ferreteria-central",
    name: "Ferretería Central Alajuela",
    slug: "ferreteria-central-alajuela",
    description: "Todo para la construcción y el hogar. Entregas a domicilio en el cantón.",
    categories: ["ferreteria", "servicios"],
    schoolId: "esc-alajuela-centro",
    lat: 10.017, lng: -84.213, district: "Alajuela",
    discount: { active: true, text: "Descuentos por volumen para juntas de educación", percentage: 0 },
    contact: { whatsapp: "7000-9999", phone: "2440-1111", email: "ventas@ferrecentral.cr" },
    hours: "L–S 7:00–17:00",
    status: "active", verified: true,
    ownerId: "usr-pablo",
    metrics: { views: 190, interactions: 25 },
    createdDaysAgo: 130,
  },
  {
    id: "veterinaria-patitas",
    name: "Veterinaria Patitas",
    slug: "veterinaria-patitas",
    description: "Consulta veterinaria, vacunación y peluquería canina.",
    categories: ["salud", "servicios"],
    schoolId: "esc-alajuela-centro",
    lat: 10.015, lng: -84.21, district: "Alajuela",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7100-1111", facebook: "vetpatitascr" },
    hours: "L–V 8:00–18:00",
    status: "active", verified: true,
    ownerId: "usr-pablo",
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
    schoolId: "esc-cartago-oriental",
    lat: 9.865, lng: -83.92, district: "Oriental",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7100-2222", instagram: "@dulcetradicion" },
    status: "active", verified: true,
    ownerId: "usr-karla",
    metrics: { views: 140, interactions: 19 },
    createdDaysAgo: 160,
  },
  {
    id: "marisqueria-el-puerto",
    name: "Marisquería El Puerto",
    slug: "marisqueria-el-puerto",
    description: "Ceviches, pescado entero y mariscos frescos frente al Paseo de los Turistas.",
    categories: ["comida"],
    schoolId: "esc-puntarenas",
    lat: 9.9765, lng: -84.839, district: "Puntarenas",
    discount: { active: true, text: "Ceviche 2x1 los miércoles", percentage: 50 },
    contact: { whatsapp: "7100-3333", phone: "2661-1111" },
    hours: "M–D 11:00–21:00",
    status: "active", verified: true,
    ownerId: "usr-pablo",
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
    schoolId: "esc-limon-centro",
    lat: 9.992, lng: -83.037, district: "Limón",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7100-4444" },
    hours: "L–S 10:00–20:00",
    status: "active", verified: true,
    ownerId: "usr-karla",
    metrics: { views: 88, interactions: 9 },
    createdDaysAgo: 70,
  },
  {
    // Supporter of a needs_reverification school (the sub was confirmed while verified).
    id: "academia-idiomas-guanacaste",
    name: "Academia de Idiomas Guanacaste",
    slug: "academia-idiomas-guanacaste",
    description: "Cursos de inglés y francés para niños y adultos en Liberia.",
    categories: ["educacion"],
    schoolId: "esc-liberia",
    lat: 10.635, lng: -85.44, district: "Liberia",
    discount: { active: true, text: "Matrícula gratis para hijos de docentes", percentage: 0 },
    contact: { whatsapp: "7100-5555", web: "https://idiomasguanacaste.cr", email: "info@idiomasguanacaste.cr" },
    hours: "L–V 8:00–20:00, S 8:00–12:00",
    status: "active", verified: true,
    ownerId: "usr-karla",
    metrics: { views: 160, interactions: 21 },
    createdDaysAgo: 95,
  },
];

// ── Subscriptions ─────────────────────────────────────────────────────────────
// Every lifecycle state. `confirmedDaysAgo`/`expiresInDays` are relative to now;
// amount = units × ₡5.000. Only the school owner/admin confirms (confirmedBy).
const UNIT_CRC = 5000;
const subscriptions = [
  // Confirmed, fresh (full weight).
  { id: "sub-soda-sj", businessId: "soda-la-esquina", schoolId: "esc-san-jose-centro", units: 3, status: "confirmed", confirmedDaysAgo: 10, expiresInDays: 80, confirmedBy: "usr-maria", proofUploaded: true, createdDaysAgo: 12 },
  // Confirmed, aging (decayed weight, still outside the expiring window).
  { id: "sub-trigal-sj", businessId: "panaderia-el-trigal", schoolId: "esc-san-jose-centro", units: 2, status: "confirmed", confirmedDaysAgo: 74, expiresInDays: 16, confirmedBy: "usr-maria", proofUploaded: true, createdDaysAgo: 75 },
  // Expiring (inside the 14-day renewal window; still counts).
  { id: "sub-cafe-escazu", businessId: "cafe-del-valle", schoolId: "esc-escazu", units: 2, status: "expiring", confirmedDaysAgo: 80, expiresInDays: 10, confirmedBy: "usr-maria", proofUploaded: true, createdDaysAgo: 82 },
  // Strong community supporter + a second subscription to another school.
  { id: "sub-farmacia-heredia", businessId: "farmacia-vida-sana", schoolId: "esc-heredia-centro", units: 8, status: "confirmed", confirmedDaysAgo: 20, expiresInDays: 70, confirmedBy: "usr-carlos", proofUploaded: true, createdDaysAgo: 21 },
  { id: "sub-farmacia-sj", businessId: "farmacia-vida-sana", schoolId: "esc-san-jose-centro", units: 2, status: "confirmed", confirmedDaysAgo: 45, expiresInDays: 45, confirmedBy: "usr-maria", proofUploaded: true, createdDaysAgo: 46 },
  // Pending WITH proof uploaded: sits in the school's confirmation queue.
  { id: "sub-moda-heredia", businessId: "moda-urbana", schoolId: "esc-heredia-centro", units: 1, status: "pending", proofUploaded: true, createdDaysAgo: 2 },
  // Confirmed in Alajuela.
  { id: "sub-ferreteria-alajuela", businessId: "ferreteria-central", schoolId: "esc-alajuela-centro", units: 5, status: "confirmed", confirmedDaysAgo: 30, expiresInDays: 60, confirmedBy: "usr-carlos", proofUploaded: true, createdDaysAgo: 31 },
  // Expired (lapsed 60 days ago — no longer counts, renewal nudge in the panel).
  { id: "sub-reposteria-cartago", businessId: "reposteria-dulce-tradicion", schoolId: "esc-cartago-oriental", units: 4, status: "expired", confirmedDaysAgo: 150, expiresInDays: -60, confirmedBy: "usr-rosa", proofUploaded: true, createdDaysAgo: 152 },
  // Pending WITHOUT proof (just committed, nothing uploaded yet).
  { id: "sub-sodacaribe-limon", businessId: "soda-caribe", schoolId: "esc-limon-centro", units: 1, status: "pending", proofUploaded: false, createdDaysAgo: 1 },
  // Confirmed toward the needs_reverification school.
  { id: "sub-academia-liberia", businessId: "academia-idiomas-guanacaste", schoolId: "esc-liberia", units: 6, status: "confirmed", confirmedDaysAgo: 40, expiresInDays: 50, confirmedBy: "usr-gabriela", proofUploaded: true, createdDaysAgo: 41 },
];

// ── Reviews ───────────────────────────────────────────────────────────────────
// businesses/{id}/reviews/{authorUid}. Authors are never the business owner/editor
// (rules forbid it). Covers: many great reviews, mixed, low-rated, none.
const reviews = [
  { businessId: "soda-la-esquina", authorId: "usr-luis", rating: 5, daysAgo: 40, text: "El casado de pollo es buenísimo y el precio justo." },
  { businessId: "soda-la-esquina", authorId: "usr-sofia", rating: 4, daysAgo: 25, text: "Rico y rápido, aunque a mediodía se llena mucho." },
  { businessId: "soda-la-esquina", authorId: "usr-elena", rating: 5, daysAgo: 12, text: "Atención de primera, se siente como comer en casa." },
  { businessId: "soda-la-esquina", authorId: "usr-david", rating: 4, daysAgo: 5, text: "Buenos gallos y refrescos naturales." },

  { businessId: "panaderia-el-trigal", authorId: "usr-ana", rating: 4, daysAgo: 50, text: "El pan baguette siempre fresco." },
  { businessId: "panaderia-el-trigal", authorId: "usr-sofia", rating: 5, daysAgo: 30, text: "La mejor repostería del centro." },
  { businessId: "panaderia-el-trigal", authorId: "usr-jorge", rating: 4, daysAgo: 8, text: "Buen café y queque de elote delicioso." },

  { businessId: "libreria-el-saber", authorId: "usr-luis", rating: 5, daysAgo: 60, text: "Tienen de todo para la entrada a clases." },
  { businessId: "libreria-el-saber", authorId: "usr-sofia", rating: 5, daysAgo: 45, text: "Precios justos y muy amables." },
  { businessId: "libreria-el-saber", authorId: "usr-elena", rating: 5, daysAgo: 33, text: "Me consiguieron un libro que nadie más tenía." },
  { businessId: "libreria-el-saber", authorId: "usr-jorge", rating: 5, daysAgo: 20, text: "Fotocopias baratas y rápidas." },
  { businessId: "libreria-el-saber", authorId: "usr-karla", rating: 5, daysAgo: 15, text: "Excelente surtido de útiles." },
  { businessId: "libreria-el-saber", authorId: "usr-david", rating: 4, daysAgo: 7, text: "Muy completo, parqueo difícil eso sí." },

  { businessId: "farmacia-vida-sana", authorId: "usr-ana", rating: 4, daysAgo: 55, text: "Siempre tienen lo que busco." },
  { businessId: "farmacia-vida-sana", authorId: "usr-sofia", rating: 4, daysAgo: 38, text: "Buen servicio y descuento con carné." },
  { businessId: "farmacia-vida-sana", authorId: "usr-elena", rating: 5, daysAgo: 22, text: "La farmacéutica explica todo con paciencia." },
  { businessId: "farmacia-vida-sana", authorId: "usr-maria", rating: 4, daysAgo: 14, text: "Abren hasta tarde, muy conveniente." },
  { businessId: "farmacia-vida-sana", authorId: "usr-jorge", rating: 4, daysAgo: 6, text: "Buenos precios en genéricos." },

  { businessId: "cafe-del-valle", authorId: "usr-sofia", rating: 5, daysAgo: 18, text: "El mejor capuccino de Escazú." },
  { businessId: "cafe-del-valle", authorId: "usr-luis", rating: 4, daysAgo: 9, text: "Brunch muy bueno, algo caro." },

  { businessId: "ferreteria-central", authorId: "usr-luis", rating: 4, daysAgo: 28, text: "Entregaron el material el mismo día." },
  { businessId: "ferreteria-central", authorId: "usr-david", rating: 5, daysAgo: 11, text: "Asesoría honesta, no venden de más." },

  { businessId: "soda-caribe", authorId: "usr-sofia", rating: 4, daysAgo: 16, text: "El rice and beans con pollo caribeño es otra cosa." },
  { businessId: "soda-caribe", authorId: "usr-pablo", rating: 5, daysAgo: 4, text: "Auténtica comida limonense." },

  // Mixed/low ratings.
  { businessId: "academia-idiomas-guanacaste", authorId: "usr-sofia", rating: 3, daysAgo: 70, text: "Buenos profes pero grupos muy grandes." },
  { businessId: "academia-idiomas-guanacaste", authorId: "usr-luis", rating: 3, daysAgo: 50, text: "El horario cambia mucho." },
  { businessId: "academia-idiomas-guanacaste", authorId: "usr-ana", rating: 4, daysAgo: 35, text: "Mi hijo mejoró mucho su inglés." },
  { businessId: "academia-idiomas-guanacaste", authorId: "usr-david", rating: 3, daysAgo: 19, text: "Está bien, esperaba más conversación." },
  { businessId: "academia-idiomas-guanacaste", authorId: "usr-elena", rating: 3, daysAgo: 10, text: "Material algo desactualizado." },

  { businessId: "moda-urbana", authorId: "usr-sofia", rating: 2, daysAgo: 13, text: "Las tallas no corresponden a lo etiquetado." },
  { businessId: "moda-urbana", authorId: "usr-ana", rating: 3, daysAgo: 3, text: "Variedad bien, calidad regular." },
];

// ── Derived data ──────────────────────────────────────────────────────────────

/** managedPages per user, derived from ownerId/editorIds on businesses and schools. */
function buildManagedPages() {
  const byUid = new Map(users.map((u) => [u.uid, []]));
  const add = (uid, type, id, role) => {
    const pages = byUid.get(uid);
    if (pages) pages.push({ type, id, role });
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
    expiresAt: confirmed ? daysAgo(-s.expiresInDays) : null,
  };
}

// ── Seed ──────────────────────────────────────────────────────────────────────

/** Wipe previously seeded data so re-runs are deterministic (no stale docs). */
async function clearData() {
  for (const col of ["categories", "schools", "businesses", "subscriptions", "users"]) {
    await db.recursiveDelete(db.collection(col));
  }
  try {
    const existing = await auth.listUsers(1000);
    if (existing.users.length > 0) {
      await auth.deleteUsers(existing.users.map((u) => u.uid));
    }
  } catch (err) {
    console.warn(`Auth emulator unreachable — skipping Auth cleanup (${err.message})`);
  }
}

/** Import users into the Auth emulator as Google accounts (visible in the sign-in picker). */
async function seedAuthUsers() {
  try {
    const result = await auth.importUsers(
      users.map((u) => ({
        uid: u.uid,
        email: u.email,
        emailVerified: true,
        displayName: u.name,
        providerData: [
          { uid: u.uid, providerId: "google.com", email: u.email, displayName: u.name },
        ],
      })),
    );
    if (result.failureCount > 0) {
      console.warn("Some Auth users failed to import:", result.errors);
    }
    return result.successCount;
  } catch (err) {
    console.warn(`Auth emulator unreachable — skipping Auth users (${err.message})`);
    return 0;
  }
}

async function seed() {
  await clearData();

  const batch = db.batch();
  const subs = subscriptions.map(materializeSubscription);
  const reviewStatsById = buildReviewStats();
  const managedPagesByUid = buildManagedPages();
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const schoolById = Object.fromEntries(schools.map((s) => [s.id, s]));
  const businessById = Object.fromEntries(businesses.map((b) => [b.id, b]));

  // Categories (businessCount = active businesses in the category).
  const countByCategory = {};
  for (const b of businesses) {
    if (b.status !== "active") continue;
    for (const c of b.categories) {
      countByCategory[c] = (countByCategory[c] || 0) + 1;
    }
  }
  for (const c of categories) {
    batch.set(db.collection("categories").doc(c.id), {
      name: c.name,
      icon: c.icon,
      order: c.order,
      businessCount: countByCategory[c.id] || 0,
    });
  }

  // Schools + private SINPE subcollection. supportingBusinesses counts distinct
  // businesses with a currently-counting subscription (same as the Cloud Function).
  for (const s of schools) {
    const supporters = new Set(
      subs.filter((x) => x.schoolId === s.id && isCounting(x)).map((x) => x.businessId),
    );
    const ref = db.collection("schools").doc(s.id);
    batch.set(ref, {
      name: s.name,
      mepCode: s.mepCode,
      description: s.description,
      thankYouMessage: s.thankYouMessage,
      location: s.location,
      boardContact: s.boardContact,
      status: "active",
      verified: s.verificationStatus === "verified",
      verificationStatus: s.verificationStatus,
      metrics: { supportingBusinesses: supporters.size },
      ownerId: s.ownerId,
      ...(s.editorIds ? { editorIds: s.editorIds } : {}),
      createdAt: daysAgo(s.createdDaysAgo),
      updatedAt: now,
    });
    batch.set(ref.collection("private").doc("data"), { sinpe: s.sinpe });
  }

  // Businesses. ranking.score is the mission-general baseline (same math as the Cloud
  // Function); totalDonated sums every once-confirmed subscription's amount.
  for (const b of businesses) {
    const school = schoolById[b.schoolId];
    const bSubs = subs.filter((s) => s.businessId === b.id);
    const reviewStats = reviewStatsById.get(b.id) ?? { count: 0, average: 0 };
    const totalDonated = bSubs
      .filter((s) => s.confirmedAt)
      .reduce((acc, s) => acc + s.units * UNIT_CRC, 0);
    batch.set(db.collection("businesses").doc(b.id), {
      name: b.name,
      slug: b.slug,
      description: b.description,
      categories: b.categories,
      categoryNames: b.categories.map((c) => categoryNameById[c]),
      location: location(b.lat, b.lng, {
        address: `${b.district}, ${school.location.canton}`,
        province: school.location.province,
        canton: school.location.canton,
        district: b.district,
      }),
      schoolId: b.schoolId,
      schoolName: school.name,
      contact: b.contact,
      discount: b.discount,
      ...(b.hours ? { hours: b.hours } : {}),
      photos: [],
      status: b.status,
      verified: b.verified,
      subscription: {
        active: b.status === "active",
        plan: "basic",
        validUntil: Timestamp.fromMillis(nowMs + 365 * DAY_MS),
      },
      ranking: { score: baselineScore(bSubs, reviewStats), totalDonated },
      metrics: b.metrics,
      reviewStats,
      ownerId: b.ownerId,
      ...(b.editorIds ? { editorIds: b.editorIds } : {}),
      createdAt: daysAgo(b.createdDaysAgo),
      updatedAt: now,
    });
  }

  // Reviews (subcollection; doc id = author uid).
  const userById = Object.fromEntries(users.map((u) => [u.uid, u]));
  for (const r of reviews) {
    const created = daysAgo(r.daysAgo);
    batch.set(
      db.collection("businesses").doc(r.businessId).collection("reviews").doc(r.authorId),
      {
        authorId: r.authorId,
        authorName: userById[r.authorId].name,
        rating: r.rating,
        text: r.text,
        createdAt: created,
        updatedAt: created,
      },
    );
  }

  // Subscriptions (denormalized names for the panel UIs).
  for (const s of subs) {
    batch.set(db.collection("subscriptions").doc(s.id), {
      businessId: s.businessId,
      businessName: businessById[s.businessId].name,
      schoolId: s.schoolId,
      schoolName: schoolById[s.schoolId].name,
      units: s.units,
      amount: s.units * UNIT_CRC,
      status: s.status,
      confirmedAt: s.confirmedAt,
      expiresAt: s.expiresAt,
      ...(s.confirmedBy ? { confirmedBy: s.confirmedBy } : {}),
      proofUploaded: s.proofUploaded,
      createdAt: daysAgo(s.createdDaysAgo),
      updatedAt: now,
    });
  }

  // Users (Firestore docs; same shape ensureUserDoc creates, plus managedPages).
  for (const u of users) {
    batch.set(db.collection("users").doc(u.uid), {
      name: u.name,
      email: u.email,
      ...(u.phone ? { phone: u.phone } : {}),
      role: u.role ?? "user",
      managedPages: managedPagesByUid.get(u.uid) ?? [],
      createdAt: daysAgo(120),
    });
  }

  await batch.commit();
  const authCount = await seedAuthUsers();

  console.log(
    `Seed OK → ${categories.length} categorías, ${schools.length} escuelas, ` +
      `${businesses.length} comercios, ${users.length} usuarios (${authCount} en Auth), ` +
      `${subscriptions.length} suscripciones, ${reviews.length} reseñas (proyecto ${PROJECT_ID}).`,
  );
  console.log(
    "Cuentas de prueba (login Google en el emulador): " +
      users.map((u) => u.email).join(", "),
  );
}

seed().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});
