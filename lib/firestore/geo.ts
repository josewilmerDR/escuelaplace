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
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from "firebase/firestore";
import {
  distanceBetween,
  geohashQueryBounds,
  type Geopoint,
} from "geofire-common";
import { db } from "@/lib/firebase";
import type { Business, BusinessDoc } from "@/types";
import { snapToList } from "./converters";

const BUSINESSES = "businesses";

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
