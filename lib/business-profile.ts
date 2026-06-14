/**
 * Pure validation for a business profile, shared between saving the edit form and
 * publishing the page. Publishing must enforce the same minimums as saving — a draft
 * with no category or no map pin would publish a profile that never shows up in the
 * /category/* listings or has no location — so the check lives here, framework-free,
 * with its own test.
 */

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
    return "Elegí al menos una categoría: sin categoría tu comercio no aparece en los listados.";
  }
  if (!fields.hasCoords) {
    return "Elegí la ubicación en el mapa.";
  }
  return null;
}
