/**
 * Proximity queries over `businesses` using geohash (geofire-common).
 *
 * Firestore has no native geospatial queries, so the geohash pattern is used:
 * compute the geohash ranges that cover the requested radius, run one query per
 * range (`orderBy('location.geohash')` + startAt/endAt) and then filter out the
 * false positives by real distance with `distanceBetween`.
 *
 * Requirement: each business must store `location.geohash` computed with
 * `geohashForLocation([lat, lng])` when writing the document.
 */
import {
  GeoPoint,
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from "firebase/firestore";
import {
  distanceBetween,
  geohashForLocation,
  geohashQueryBounds,
  type Geopoint,
} from "geofire-common";
import { db } from "@/lib/firebase";
import type { Business, BusinessDoc, School } from "@/types";
import { snapToList } from "./converters";

const BUSINESSES = "businesses";
const SCHOOLS = "schools";

/**
 * Location captured by the creation/edit forms: lat/lng plus the country-agnostic
 * administrative levels (see types/firestore.ts — admin1 = province/state/department,
 * admin2 = canton/municipality, admin3 = district/community, "" when absent). Shared by
 * the business and school writes, which both convert it with `toLocation`.
 */
export interface LocationInput {
  lat: number;
  lng: number;
  admin1: string;
  admin2: string;
  admin3: string;
  /** ISO 3166-1 alpha-2 code from the reverse geocoder, when available. */
  country?: string;
  address?: string;
}

/**
 * Build the stored `location` object from raw form input, always recomputing the geohash
 * so proximity queries stay correct when the pin moves. Conditional spread because
 * Firestore rejects explicit `undefined` values.
 */
export function toLocation(input: LocationInput) {
  return {
    geopoint: new GeoPoint(input.lat, input.lng),
    geohash: geohashForLocation([input.lat, input.lng]),
    ...(input.address ? { address: input.address } : {}),
    ...(input.country ? { country: input.country } : {}),
    admin1: input.admin1,
    admin2: input.admin2,
    admin3: input.admin3,
  };
}

export interface NearbyBusiness extends BusinessDoc {
  /** Distance to the search center, in kilometers. */
  distanceKm: number;
}

/**
 * Businesses within `radiusKm` of a point, ordered by ascending distance.
 *
 * @param center [lat, lng]
 * @param radiusKm search radius in kilometers (default 5km)
 */
export async function getNearbyBusinesses(
  center: Geopoint,
  radiusKm = 5,
): Promise<NearbyBusiness[]> {
  const radiusM = radiusKm * 1000;
  const bounds = geohashQueryBounds(center, radiusM);

  const snaps = await Promise.all(
    bounds.map((b) =>
      getDocs(
        query(
          collection(db, BUSINESSES),
          orderBy("location.geohash"),
          startAt(b[0]),
          endAt(b[1]),
        ),
      ),
    ),
  );

  const results: NearbyBusiness[] = [];
  for (const snap of snaps) {
    for (const c of snapToList<Business>(snap)) {
      const gp = c.location?.geopoint;
      if (!gp) continue;
      const distKm = distanceBetween([gp.latitude, gp.longitude], center);
      if (distKm * 1000 <= radiusM) {
        results.push({ ...c, distanceKm: distKm });
      }
    }
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Ids of schools within `radiusKm` of a point. Used to resolve the buyer's "community"
 * (the institutions near them) so the feed can boost businesses that support them. Same
 * geohash-bounds + distance-filter pattern as `getNearbyBusinesses`.
 */
export async function getNearbySchoolIds(
  center: Geopoint,
  radiusKm = 5,
): Promise<string[]> {
  const radiusM = radiusKm * 1000;
  const bounds = geohashQueryBounds(center, radiusM);

  const snaps = await Promise.all(
    bounds.map((b) =>
      getDocs(
        query(
          collection(db, SCHOOLS),
          orderBy("location.geohash"),
          startAt(b[0]),
          endAt(b[1]),
        ),
      ),
    ),
  );

  const ids: string[] = [];
  for (const snap of snaps) {
    for (const s of snapToList<School>(snap)) {
      const gp = s.location?.geopoint;
      if (!gp) continue;
      if (distanceBetween([gp.latitude, gp.longitude], center) * 1000 <= radiusM) {
        ids.push(s.id);
      }
    }
  }
  return ids;
}
