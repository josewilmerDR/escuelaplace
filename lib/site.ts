/**
 * The canonical public origin of the site, mirrored from `metadataBase` in app/layout.tsx.
 * Used to build ABSOLUTE URLs where relative ones aren't allowed — notably JSON-LD
 * structured data: Google ignores relative `item`/`url` values in BreadcrumbList/ItemList,
 * so a relative breadcrumb silently yields no rich result.
 */
export const SITE_URL = "https://escuelaplace.com";

/** Resolve a root-relative path ("/categories", "/business/x") into an absolute URL. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
