/**
 * Mappers from Firestore `*Doc` types (which hold non-serializable Timestamp/GeoPoint
 * values) to plain, JSON-serializable DTOs that server components can pass to client
 * components.
 */
import type { BusinessCardData, BusinessDoc } from "@/types";

/** Render-ready, serializable card data for a business. */
export function toBusinessCardData(b: BusinessDoc): BusinessCardData {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    schoolId: b.schoolId,
    schoolName: b.schoolName,
    categoryNames: b.categoryNames ?? [],
    logoUrl: b.logoUrl,
    photo: b.photos?.[0],
    discount: b.discount,
    ranking: { score: b.ranking?.score ?? 0 },
    reviewStats: b.reviewStats ?? { count: 0, average: 0 },
  };
}
