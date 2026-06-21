/**
 * The canonical public origin of the site, also fed to `metadataBase` in app/layout.tsx.
 * Used to build ABSOLUTE URLs where relative ones aren't allowed — notably JSON-LD
 * structured data (Google ignores relative `item`/`url` values, so a relative breadcrumb
 * silently yields no rich result) AND Open Graph `og:image` URLs, which link-preview
 * scrapers (WhatsApp/Facebook) MUST be able to fetch.
 *
 * Sourced from `NEXT_PUBLIC_SITE_URL` so it tracks the origin the site is actually served
 * from — it MUST match that origin, otherwise og:image resolves to a domain the scraper
 * can't fetch and no share preview renders. Set it in apphosting.yaml (currently the custom
 * domain, escuelaplace.com). The fallback is the canonical domain.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://escuelaplace.com";

/** Resolve a root-relative path ("/categories", "/business/x") into an absolute URL. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
