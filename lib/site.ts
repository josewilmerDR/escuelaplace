/**
 * The canonical public origin of the site, also fed to `metadataBase` in app/layout.tsx.
 * Used to build ABSOLUTE URLs where relative ones aren't allowed — notably JSON-LD
 * structured data (Google ignores relative `item`/`url` values, so a relative breadcrumb
 * silently yields no rich result) AND Open Graph `og:image` URLs, which link-preview
 * scrapers (WhatsApp/Facebook) MUST be able to fetch.
 *
 * Sourced from `NEXT_PUBLIC_SITE_URL` so it tracks the origin the site is actually served
 * from. While the custom domain (escuelaplace.com) isn't connected yet, this must point at
 * the live App Hosting URL — otherwise og:image resolves to a domain that doesn't yet exist
 * and no share preview renders. Set it in apphosting.yaml; switch to escuelaplace.com once
 * the custom domain is live. The fallback is the eventual canonical domain.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://escuelaplace.com";

/** Resolve a root-relative path ("/categories", "/business/x") into an absolute URL. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
