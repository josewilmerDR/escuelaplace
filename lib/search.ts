/**
 * Search relevance R ∈ [0,1] for a business against a free-text query.
 *
 * Firestore has no full-text search, so for the MVP relevance is computed in memory over a
 * candidate set: each query term is matched against the business name (highest weight),
 * its category names, and its description. R is the average per-term weight, so unmatched
 * terms drag it down and a query with no matches yields 0 (which the ranking gate then
 * drops — the mission never surfaces irrelevant results). Swap this for Algolia/Typesense
 * when the catalog outgrows in-memory scoring.
 */
const NAME_WEIGHT = 1;
const CATEGORY_WEIGHT = 0.8;
const DESCRIPTION_WEIGHT = 0.5;
const MIN_TERM_LENGTH = 3;

/** Common Spanish stopwords to ignore (short ones are already dropped by length). */
const STOPWORDS = new Set([
  "los",
  "las",
  "una",
  "uno",
  "unos",
  "unas",
  "del",
  "con",
  "por",
  "para",
  "que",
]);

/** Normalize a raw query string param into the canonical query: missing → "", trimmed. */
export function searchQuery(q: string | undefined): string {
  return (q ?? "").trim();
}

/** Lowercase and strip accents so "Inglés" matches "ingles". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Meaningful query terms: normalized, split on non-alphanumerics, stopwords removed. */
export function queryTerms(query: string): string[] {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TERM_LENGTH && !STOPWORDS.has(t));
}

export interface SearchableBusiness {
  name: string;
  categoryNames: string[];
  description?: string;
}

/**
 * Relevance of a business to the query, in [0,1]. Returns 0 when the query has no
 * meaningful terms or nothing matches.
 */
export function relevanceScore(
  business: SearchableBusiness,
  query: string,
): number {
  const terms = queryTerms(query);
  if (terms.length === 0) return 0;

  const name = normalize(business.name);
  const categories = normalize(business.categoryNames.join(" "));
  const description = normalize(business.description ?? "");

  let weight = 0;
  for (const term of terms) {
    if (name.includes(term)) weight += NAME_WEIGHT;
    else if (categories.includes(term)) weight += CATEGORY_WEIGHT;
    else if (description.includes(term)) weight += DESCRIPTION_WEIGHT;
  }

  return Math.min(1, weight / terms.length);
}
