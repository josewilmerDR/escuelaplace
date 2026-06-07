/**
 * Seed script for the Firestore emulator.
 *
 * Populates categories, schools (+ private SINPE subcollection) and businesses with
 * realistic Costa Rican sample data so the app shows content in local development.
 *
 * Uses firebase-admin pointed at the emulator (FIRESTORE_EMULATOR_HOST), which bypasses
 * security rules — that is why this never touches production and needs no credentials.
 *
 * Run with the emulators up:  npm run seed
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, GeoPoint, Timestamp } from "firebase-admin/firestore";
import { geohashForLocation } from "geofire-common";

// Safety: only run against the emulator, never against a real project.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-escuelaplace";
initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const now = Timestamp.now();

/** Build a Location object with geopoint + geohash from lat/lng. */
function location(lat, lng, extra = {}) {
  return {
    geopoint: new GeoPoint(lat, lng),
    geohash: geohashForLocation([lat, lng]),
    ...extra,
  };
}

// ── Categories ────────────────────────────────────────────────────────────────
const categories = [
  { id: "comida", name: "Comida y Restaurantes", icon: "🍽️", order: 1 },
  { id: "panaderia", name: "Panaderías y Reposterías", icon: "🥐", order: 2 },
  { id: "salud", name: "Salud y Bienestar", icon: "💊", order: 3 },
  { id: "educacion", name: "Educación y Cursos", icon: "📚", order: 4 },
  { id: "servicios", name: "Servicios", icon: "🔧", order: 5 },
];

// ── Schools ───────────────────────────────────────────────────────────────────
const schools = [
  {
    id: "esc-san-jose-centro",
    name: "Escuela Juan Rafael Mora Porras",
    mepCode: "0123",
    description:
      "Escuela pública en el centro de San José, comprometida con la comunidad.",
    thankYouMessage:
      "¡Gracias por apoyar a nuestra escuela! Tu aporte hace la diferencia.",
    location: location(9.9325, -84.0791, {
      province: "San José",
      canton: "San José",
      district: "Carmen",
    }),
    boardContact: {
      name: "María Rodríguez",
      phone: "8888-1111",
      email: "junta@esc-mora.cr",
    },
    sinpe: { number: "8888-1111", accountHolder: "Junta de Educación JRMP" },
  },
  {
    id: "esc-heredia-centro",
    name: "Escuela República de Argentina",
    mepCode: "0456",
    description: "Institución educativa con fuerte vínculo con el comercio local.",
    thankYouMessage: "Cada comercio aliado nos ayuda a crecer. ¡Mil gracias!",
    location: location(9.9981, -84.1167, {
      province: "Heredia",
      canton: "Heredia",
      district: "Heredia",
    }),
    boardContact: {
      name: "Carlos Jiménez",
      phone: "8888-2222",
      email: "junta@esc-argentina.cr",
    },
    sinpe: { number: "8888-2222", accountHolder: "Junta de Educación Rep. Argentina" },
  },
];

// ── Businesses ──────────────────────────────────────────────────────────────────
const businesses = [
  {
    id: "soda-la-esquina",
    name: "Soda La Esquina",
    slug: "soda-la-esquina",
    description: "Comidas caseras costarricenses. Casados, gallos y refrescos naturales.",
    categories: ["comida"],
    schoolId: "esc-san-jose-centro",
    lat: 9.933,
    lng: -84.079,
    district: "Carmen",
    discount: { active: true, text: "10% en casados los lunes", percentage: 10 },
    contact: { whatsapp: "7000-1111", phone: "2222-1111", instagram: "@sodalaesquina" },
    score: 95,
    totalDonated: 120000,
  },
  {
    id: "panaderia-el-trigal",
    name: "Panadería El Trigal",
    slug: "panaderia-el-trigal",
    description: "Pan fresco todos los días, repostería y café de altura.",
    categories: ["panaderia", "comida"],
    schoolId: "esc-san-jose-centro",
    lat: 9.931,
    lng: -84.08,
    district: "Carmen",
    discount: { active: false, text: "" },
    contact: { whatsapp: "7000-2222", phone: "2222-2222" },
    score: 80,
    totalDonated: 90000,
  },
  {
    id: "farmacia-vida-sana",
    name: "Farmacia Vida Sana",
    slug: "farmacia-vida-sana",
    description: "Medicamentos, productos de cuidado personal y asesoría farmacéutica.",
    categories: ["salud"],
    schoolId: "esc-heredia-centro",
    lat: 9.998,
    lng: -84.116,
    district: "Heredia",
    discount: { active: true, text: "5% presentando carné estudiantil", percentage: 5 },
    contact: { whatsapp: "7000-3333", phone: "2222-3333", web: "https://vidasana.cr" },
    score: 88,
    totalDonated: 150000,
  },
];

async function seed() {
  const batch = db.batch();

  // Categories (businessCount filled in after counting businesses).
  const countByCategory = {};
  for (const b of businesses) {
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

  // Schools + private SINPE subcollection.
  const supportingBySchool = {};
  for (const b of businesses) {
    supportingBySchool[b.schoolId] = (supportingBySchool[b.schoolId] || 0) + 1;
  }
  for (const s of schools) {
    const ref = db.collection("schools").doc(s.id);
    batch.set(ref, {
      name: s.name,
      mepCode: s.mepCode,
      description: s.description,
      thankYouMessage: s.thankYouMessage,
      location: s.location,
      boardContact: s.boardContact,
      status: "active",
      verified: true,
      metrics: { supportingBusinesses: supportingBySchool[s.id] || 0 },
      createdAt: now,
      updatedAt: now,
    });
    batch.set(ref.collection("private").doc("data"), {
      sinpe: s.sinpe,
    });
  }

  // Businesses.
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const schoolNameById = Object.fromEntries(schools.map((s) => [s.id, s.name]));
  for (const b of businesses) {
    const school = schools.find((s) => s.id === b.schoolId);
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
      schoolName: schoolNameById[b.schoolId],
      contact: b.contact,
      discount: b.discount,
      photos: [],
      status: "active",
      verified: true,
      subscription: {
        active: true,
        plan: "basic",
        validUntil: Timestamp.fromMillis(now.toMillis() + 365 * 24 * 60 * 60 * 1000),
      },
      ranking: { score: b.score, totalDonated: b.totalDonated },
      metrics: { views: 0, interactions: 0 },
      ownerId: `owner-${b.id}`,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
  console.log(
    `Seed OK → ${categories.length} categorías, ${schools.length} escuelas, ${businesses.length} comercios (proyecto ${PROJECT_ID}).`,
  );
}

seed().catch((err) => {
  console.error("Seed falló:", err);
  process.exit(1);
});
