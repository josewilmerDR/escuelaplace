/**
 * Display helpers for a Location's administrative hierarchy. admin1..admin3 are the
 * country-agnostic geocoder levels (see types/firestore.ts); any of them may be
 * missing or "" on legacy/sparse docs, so every formatter filters empties.
 */
import type { Location } from "@/types";

/** Short "locality, region" label (admin2, admin1) — e.g. "Liberia, Guanacaste".
 * Used by school combobox hints and headers. "" when nothing is set. */
export function localityLabel(location?: Partial<Location>): string {
  return [location?.admin2, location?.admin1].filter(Boolean).join(", ");
}

/** Full display parts, most specific first: address, admin3, admin2, admin1. */
export function locationParts(location?: Partial<Location>): string[] {
  return [
    location?.address,
    location?.admin3,
    location?.admin2,
    location?.admin1,
  ].filter((part): part is string => Boolean(part));
}
