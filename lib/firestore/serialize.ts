/**
 * Mappers from Firestore `*Doc` types (which hold non-serializable Timestamp/GeoPoint
 * values) to plain, JSON-serializable DTOs that server components can pass to client
 * components.
 */
import type {
  Business,
  BusinessCardData,
  BusinessDoc,
  SchoolCardData,
  SchoolDoc,
} from "@/types";
import { localityLabel } from "@/lib/location";

/**
 * Split a business's images into the explicit cover and the gallery. Docs created
 * before `coverUrl` existed stored the cover as photos[0] — recognizable because it
 * was uploaded to the `businesses/{id}/cover` Storage path (encoded in the download
 * URL), unlike gallery photos which live under `.../gallery/`.
 */
export function splitBusinessPhotos(
  b: Pick<Business, "coverUrl" | "photos">,
): { cover?: string; gallery: string[] } {
  const photos = b.photos ?? [];
  if (b.coverUrl) return { cover: b.coverUrl, gallery: photos };
  if (photos[0]?.includes("%2Fcover")) {
    return { cover: photos[0], gallery: photos.slice(1) };
  }
  return { cover: undefined, gallery: photos };
}

/** Render-ready, serializable card data for a business. */
export function toBusinessCardData(b: BusinessDoc): BusinessCardData {
  const { cover, gallery } = splitBusinessPhotos(b);
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    schoolId: b.schoolId,
    schoolName: b.schoolName,
    categoryNames: b.categoryNames ?? [],
    logoUrl: b.logoUrl,
    // The card thumbnail: the cover, or the first gallery photo — any photo beats
    // the logo-on-tint fallback.
    photo: cover ?? gallery[0],
    discount: b.discount,
    ranking: { score: b.ranking?.score ?? 0 },
    reviewStats: b.reviewStats ?? { count: 0, average: 0 },
  };
}

/**
 * Render-ready, serializable card data for a school (the public /schools directory and the
 * donation picker). Drops the non-serializable Timestamp/GeoPoint values and precomputes the
 * locality label and cover thumbnail. `lat`/`lng` are kept so the client can re-order the
 * cards by proximity. Cover fallback ladder matches the public school page: cover → first
 * gallery photo → profile photo.
 */
export function toSchoolCardData(s: SchoolDoc): SchoolCardData {
  const gp = s.location?.geopoint;
  return {
    id: s.id,
    name: s.name,
    locality: localityLabel(s.location),
    photoUrl: s.photoUrl,
    photo: s.coverUrl ?? s.photos?.[0] ?? s.photoUrl,
    verified: s.verified ?? false,
    supportingBusinesses: s.metrics?.supportingBusinesses ?? 0,
    uniqueSupporters: s.metrics?.uniqueSupporters ?? 0,
    lat: gp ? gp.latitude : null,
    lng: gp ? gp.longitude : null,
  };
}
