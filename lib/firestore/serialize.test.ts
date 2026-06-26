import { describe, expect, it } from "vitest";
import {
  splitBusinessPhotos,
  toBusinessCardData,
  toSchoolCardData,
} from "./serialize";
import type { BusinessDoc, SchoolDoc } from "@/types";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

/** A GeoPoint-shaped plain object (structurally compatible with firebase GeoPoint). */
function fakeGeopoint(lat: number, lng: number) {
  return { latitude: lat, longitude: lng };
}

/** A Timestamp-shaped plain object — only used to satisfy required Timestamp fields. */
const fakeTimestamp = { seconds: 0, nanoseconds: 0 } as unknown as import("firebase/firestore").Timestamp;

/** Minimal valid BusinessDoc — only the fields serialize.ts touches. */
function makeBusinessDoc(
  overrides: Partial<BusinessDoc> = {},
): BusinessDoc {
  return {
    id: "biz-1",
    name: "Test Business",
    slug: "test-business",
    schoolId: "school-1",
    schoolName: "Test School",
    categories: ["cat-1"],
    categoryNames: ["Category One"],
    location: {
      geopoint: fakeGeopoint(9.93, -84.08) as unknown as import("firebase/firestore").GeoPoint,
      geohash: "d1v1",
      admin1: "San José",
      admin2: "San José",
      admin3: "Carmen",
    },
    contact: {},
    discount: { active: false, text: "" },
    photos: [],
    status: "active",
    verified: true,
    subscription: { active: true, plan: "basic", validUntil: null },
    ranking: { score: 42, totalDonated: 10000 },
    metrics: { views: 0, interactions: 0 },
    reviewStats: { count: 3, average: 4.5 },
    ownerId: "uid-1",
    createdAt: fakeTimestamp,
    updatedAt: fakeTimestamp,
    description: "",
    ...overrides,
  };
}

/** Minimal valid SchoolDoc — only the fields serialize.ts touches. */
function makeSchoolDoc(overrides: Partial<SchoolDoc> = {}): SchoolDoc {
  return {
    id: "school-1",
    name: "Test School",
    description: "A great school",
    thankYouMessage: "",
    location: {
      geopoint: fakeGeopoint(9.93, -84.08) as unknown as import("firebase/firestore").GeoPoint,
      geohash: "d1v1",
      admin1: "San José",
      admin2: "San José",
      admin3: "Carmen",
      country: "CR",
    },
    photoUrl: "https://example.com/photo.jpg",
    boardContact: { name: "Ana" },
    status: "active",
    verified: true,
    verificationStatus: "verified",
    metrics: { supportingBusinesses: 5, uniqueSupporters: 3 },
    ownerId: "uid-1",
    createdAt: fakeTimestamp,
    updatedAt: fakeTimestamp,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// splitBusinessPhotos
// ---------------------------------------------------------------------------

describe("splitBusinessPhotos", () => {
  it("explicit coverUrl wins and the whole photos[] becomes the gallery", () => {
    const result = splitBusinessPhotos({
      coverUrl: "https://cdn.example.com/cover.jpg",
      photos: [
        "https://cdn.example.com/a.jpg",
        "https://cdn.example.com/b.jpg",
      ],
    });
    expect(result.cover).toBe("https://cdn.example.com/cover.jpg");
    expect(result.gallery).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
  });

  it("no coverUrl but photos[0] contains the legacy '%2Fcover' marker -> cover=photos[0], gallery=rest", () => {
    const legacyCover =
      "https://firebasestorage.googleapis.com/v0/b/x/o/businesses%2F123%2Fcover%2Fimg.jpg?alt=media";
    const gallery1 = "https://firebasestorage.googleapis.com/v0/b/x/o/businesses%2F123%2Fgallery%2Fa.jpg?alt=media";
    const gallery2 = "https://firebasestorage.googleapis.com/v0/b/x/o/businesses%2F123%2Fgallery%2Fb.jpg?alt=media";

    const result = splitBusinessPhotos({
      coverUrl: undefined,
      photos: [legacyCover, gallery1, gallery2],
    });

    expect(result.cover).toBe(legacyCover);
    expect(result.gallery).toEqual([gallery1, gallery2]);
  });

  it("no coverUrl and no legacy cover marker -> cover undefined, gallery equals photos", () => {
    const photo1 = "https://example.com/gallery/a.jpg";
    const photo2 = "https://example.com/gallery/b.jpg";

    const result = splitBusinessPhotos({
      coverUrl: undefined,
      photos: [photo1, photo2],
    });

    expect(result.cover).toBeUndefined();
    expect(result.gallery).toEqual([photo1, photo2]);
  });

  it("photos undefined -> gallery is an empty array, cover is undefined", () => {
    // Legacy/partial docs may lack `photos`; the function resolves it with `?? []`.
    const result = splitBusinessPhotos({
      coverUrl: undefined,
      photos: undefined as unknown as string[],
    });
    expect(result.cover).toBeUndefined();
    expect(result.gallery).toEqual([]);
  });

  it("photos empty array -> gallery is empty, cover is undefined when no coverUrl", () => {
    const result = splitBusinessPhotos({ coverUrl: undefined, photos: [] });
    expect(result.cover).toBeUndefined();
    expect(result.gallery).toEqual([]);
  });

  it("explicit coverUrl with empty photos[] -> gallery is empty", () => {
    const result = splitBusinessPhotos({
      coverUrl: "https://example.com/cover.jpg",
      photos: [],
    });
    expect(result.cover).toBe("https://example.com/cover.jpg");
    expect(result.gallery).toEqual([]);
  });

  it("photos[0] without '%2Fcover' in URL is NOT treated as legacy cover", () => {
    const photo1 = "https://example.com/gallery/img.jpg";
    const result = splitBusinessPhotos({ coverUrl: undefined, photos: [photo1] });
    expect(result.cover).toBeUndefined();
    expect(result.gallery).toEqual([photo1]);
  });
});

// ---------------------------------------------------------------------------
// toBusinessCardData
// ---------------------------------------------------------------------------

describe("toBusinessCardData", () => {
  it("maps required fields directly from BusinessDoc", () => {
    const doc = makeBusinessDoc();
    const card = toBusinessCardData(doc);

    expect(card.id).toBe("biz-1");
    expect(card.name).toBe("Test Business");
    expect(card.slug).toBe("test-business");
    expect(card.schoolId).toBe("school-1");
    expect(card.schoolName).toBe("Test School");
  });

  it("thumbnail uses cover when coverUrl is set", () => {
    const doc = makeBusinessDoc({
      coverUrl: "https://example.com/cover.jpg",
      photos: ["https://example.com/gallery.jpg"],
    });
    const card = toBusinessCardData(doc);
    expect(card.photo).toBe("https://example.com/cover.jpg");
  });

  it("thumbnail falls back to gallery[0] when no explicit coverUrl and no legacy cover marker", () => {
    const doc = makeBusinessDoc({
      coverUrl: undefined,
      photos: ["https://example.com/gallery1.jpg", "https://example.com/gallery2.jpg"],
    });
    const card = toBusinessCardData(doc);
    expect(card.photo).toBe("https://example.com/gallery1.jpg");
  });

  it("thumbnail uses legacy photos[0] cover when it contains '%2Fcover'", () => {
    const legacyCover = "https://storage.googleapis.com/x/businesses%2F1%2Fcover%2Fi.jpg";
    const doc = makeBusinessDoc({
      coverUrl: undefined,
      photos: [legacyCover, "https://example.com/g.jpg"],
    });
    const card = toBusinessCardData(doc);
    expect(card.photo).toBe(legacyCover);
  });

  it("thumbnail is undefined when no coverUrl and no photos", () => {
    const doc = makeBusinessDoc({ coverUrl: undefined, photos: [] });
    const card = toBusinessCardData(doc);
    expect(card.photo).toBeUndefined();
  });

  it("categoryNames defaults to [] when absent on the doc", () => {
    const doc = makeBusinessDoc({
      categoryNames: undefined as unknown as string[],
    });
    const card = toBusinessCardData(doc);
    expect(card.categoryNames).toEqual([]);
  });

  it("ranking.score defaults to 0 when ranking is absent", () => {
    const doc = makeBusinessDoc({
      ranking: undefined as unknown as BusinessDoc["ranking"],
    });
    const card = toBusinessCardData(doc);
    expect(card.ranking.score).toBe(0);
  });

  it("ranking.score is taken from the doc when present", () => {
    const doc = makeBusinessDoc({ ranking: { score: 99, totalDonated: 5000 } });
    const card = toBusinessCardData(doc);
    expect(card.ranking.score).toBe(99);
  });

  it("reviewStats defaults to {count:0, average:0} when absent", () => {
    const doc = makeBusinessDoc({
      reviewStats: undefined as unknown as BusinessDoc["reviewStats"],
    });
    const card = toBusinessCardData(doc);
    expect(card.reviewStats).toEqual({ count: 0, average: 0 });
  });

  it("reviewStats is taken from the doc when present", () => {
    const doc = makeBusinessDoc({ reviewStats: { count: 7, average: 4.2 } });
    const card = toBusinessCardData(doc);
    expect(card.reviewStats).toEqual({ count: 7, average: 4.2 });
  });

  it("passes discount through as-is", () => {
    const discount = { active: true, text: "10% off", percentage: 10 };
    const doc = makeBusinessDoc({ discount });
    const card = toBusinessCardData(doc);
    expect(card.discount).toEqual(discount);
  });
});

// ---------------------------------------------------------------------------
// toSchoolCardData
// ---------------------------------------------------------------------------

describe("toSchoolCardData", () => {
  it("maps required identity fields directly", () => {
    const doc = makeSchoolDoc();
    const card = toSchoolCardData(doc);
    expect(card.id).toBe("school-1");
    expect(card.name).toBe("Test School");
  });

  it("cover ladder: coverUrl takes precedence over photos[0] and photoUrl", () => {
    const doc = makeSchoolDoc({
      coverUrl: "https://example.com/cover.jpg",
      photos: ["https://example.com/gallery.jpg"],
      photoUrl: "https://example.com/avatar.jpg",
    });
    const card = toSchoolCardData(doc);
    expect(card.photo).toBe("https://example.com/cover.jpg");
  });

  it("cover ladder: photos[0] is used when no coverUrl", () => {
    const doc = makeSchoolDoc({
      coverUrl: undefined,
      photos: ["https://example.com/gallery.jpg"],
      photoUrl: "https://example.com/avatar.jpg",
    });
    const card = toSchoolCardData(doc);
    expect(card.photo).toBe("https://example.com/gallery.jpg");
  });

  it("cover ladder: photoUrl is the final fallback when no coverUrl or photos", () => {
    const doc = makeSchoolDoc({
      coverUrl: undefined,
      photos: undefined,
      photoUrl: "https://example.com/avatar.jpg",
    });
    const card = toSchoolCardData(doc);
    expect(card.photo).toBe("https://example.com/avatar.jpg");
  });

  it("photo is undefined when none of coverUrl/photos/photoUrl is set", () => {
    const doc = makeSchoolDoc({
      coverUrl: undefined,
      photos: undefined,
      photoUrl: undefined,
    });
    const card = toSchoolCardData(doc);
    expect(card.photo).toBeUndefined();
  });

  it("photos empty array falls through to photoUrl fallback", () => {
    const doc = makeSchoolDoc({
      coverUrl: undefined,
      photos: [],
      photoUrl: "https://example.com/avatar.jpg",
    });
    const card = toSchoolCardData(doc);
    // photos[0] is undefined, so the ladder continues to photoUrl
    expect(card.photo).toBe("https://example.com/avatar.jpg");
  });

  it("verified defaults to false when absent on doc", () => {
    const doc = makeSchoolDoc({ verified: undefined as unknown as boolean });
    const card = toSchoolCardData(doc);
    expect(card.verified).toBe(false);
  });

  it("verified is true when set to true on doc", () => {
    const doc = makeSchoolDoc({ verified: true });
    const card = toSchoolCardData(doc);
    expect(card.verified).toBe(true);
  });

  it("supportingBusinesses defaults to 0 when metrics absent", () => {
    const doc = makeSchoolDoc({
      metrics: undefined as unknown as SchoolDoc["metrics"],
    });
    const card = toSchoolCardData(doc);
    expect(card.supportingBusinesses).toBe(0);
  });

  it("uniqueSupporters defaults to 0 when metrics.uniqueSupporters absent", () => {
    const doc = makeSchoolDoc({
      metrics: { supportingBusinesses: 4, uniqueSupporters: undefined },
    });
    const card = toSchoolCardData(doc);
    expect(card.uniqueSupporters).toBe(0);
  });

  it("metrics values are taken from the doc when present", () => {
    const doc = makeSchoolDoc({
      metrics: { supportingBusinesses: 7, uniqueSupporters: 3 },
    });
    const card = toSchoolCardData(doc);
    expect(card.supportingBusinesses).toBe(7);
    expect(card.uniqueSupporters).toBe(3);
  });

  it("lat and lng are extracted from location.geopoint", () => {
    const doc = makeSchoolDoc({
      location: {
        geopoint: fakeGeopoint(10.5, -85.2) as unknown as import("firebase/firestore").GeoPoint,
        geohash: "d",
        admin1: "Guanacaste",
        admin2: "Liberia",
        admin3: "",
        country: "CR",
      },
    });
    const card = toSchoolCardData(doc);
    expect(card.lat).toBe(10.5);
    expect(card.lng).toBe(-85.2);
  });

  it("lat and lng are null when location has no geopoint", () => {
    const doc = makeSchoolDoc({
      location: {
        geopoint: undefined as unknown as import("firebase/firestore").GeoPoint,
        geohash: "",
        admin1: "",
        admin2: "",
        admin3: "",
      },
    });
    const card = toSchoolCardData(doc);
    expect(card.lat).toBeNull();
    expect(card.lng).toBeNull();
  });

  it("hasActiveProject defaults to false when opts not provided", () => {
    const doc = makeSchoolDoc();
    const card = toSchoolCardData(doc);
    expect(card.hasActiveProject).toBe(false);
  });

  it("hasActiveProject is true when passed as opts.hasActiveProject=true", () => {
    const doc = makeSchoolDoc();
    const card = toSchoolCardData(doc, { hasActiveProject: true });
    expect(card.hasActiveProject).toBe(true);
  });

  it("hasActiveProject is false when opts is provided but hasActiveProject omitted", () => {
    const doc = makeSchoolDoc();
    const card = toSchoolCardData(doc, {});
    expect(card.hasActiveProject).toBe(false);
  });

  it("locality is computed from location admin fields (admin2, admin1)", () => {
    const doc = makeSchoolDoc({
      location: {
        geopoint: fakeGeopoint(9.93, -84.08) as unknown as import("firebase/firestore").GeoPoint,
        geohash: "d1v1",
        admin1: "San José",
        admin2: "Liberia",
        admin3: "",
        country: "CR",
      },
    });
    const card = toSchoolCardData(doc);
    expect(card.locality).toBe("Liberia, San José");
  });

  it("locality is empty string when admin fields are missing", () => {
    const doc = makeSchoolDoc({
      location: {
        geopoint: fakeGeopoint(0, 0) as unknown as import("firebase/firestore").GeoPoint,
        geohash: "",
        admin1: "",
        admin2: "",
        admin3: "",
      },
    });
    const card = toSchoolCardData(doc);
    expect(card.locality).toBe("");
  });

  it("photoUrl is passed through to the card", () => {
    const doc = makeSchoolDoc({ photoUrl: "https://example.com/avatar.jpg" });
    const card = toSchoolCardData(doc);
    expect(card.photoUrl).toBe("https://example.com/avatar.jpg");
  });
});
