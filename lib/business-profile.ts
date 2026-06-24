/**
 * Pure validation for a business profile, shared between saving the edit form and
 * publishing the page. Publishing must enforce the same minimums as saving — a draft
 * with no category or no map pin would publish a profile that never shows up in the
 * /category/* listings or has no location — so the check lives here, framework-free,
 * with its own test.
 */

import { BUSINESS_TAG_MAX, BUSINESS_TAGS_MAX } from "@/types";
import { normalize } from "./search";

/**
 * Clean a raw list of search tags for storage: trim each, collapse inner whitespace, drop
 * empties, truncate to BUSINESS_TAG_MAX chars, de-duplicate case/accent-insensitively
 * (keeping the first-seen casing), and cap the count at BUSINESS_TAGS_MAX. Pure so both the
 * edit form and any future importer share one definition; the UI caps live here, not in
 * Firestore rules (tags are non-sensitive editorial text, like the description).
 */
export function normalizeTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const tag = value.trim().replace(/\s+/g, " ").slice(0, BUSINESS_TAG_MAX);
    if (!tag) continue;
    const key = normalize(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= BUSINESS_TAGS_MAX) break;
  }
  return out;
}

export interface BusinessProfileFields {
  /** Selected category ids. */
  categories: string[];
  /** Whether a map location (pin) has been chosen. */
  hasCoords: boolean;
}

/**
 * The first blocking problem with the profile (Spanish copy, ready to show), or null
 * when it is publishable. Order mirrors the form top-to-bottom so the message points at
 * the earliest missing field.
 */
export function validateBusinessProfile(
  fields: BusinessProfileFields,
): string | null {
  // Without a category the business never appears in the /category/* listings — one of
  // the main discovery paths — so it can't be emptied (or published) silently.
  if (fields.categories.length === 0) {
    return "Elige al menos una categoría: sin categoría tu comercio no aparece en los listados.";
  }
  if (!fields.hasCoords) {
    return "Elige la ubicación en el mapa.";
  }
  return null;
}
