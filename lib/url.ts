/**
 * URL safety helpers for user-generated content.
 *
 * Stored URLs that reach an `<a href>` (or any navigation sink) must be scheme-checked:
 * a `javascript:`/`data:`/`vbscript:` value would execute in the visitor's origin on click
 * (stored XSS). The only honest test of a scheme is to PARSE the URL and inspect the
 * resulting protocol — never a substring/regex match, which whitespace- and case-smuggling
 * defeat. The WHATWG parser strips leading/trailing controls and ALL inline tabs/newlines
 * before resolving the scheme, then lowercases it, so obfuscated payloads collapse to their
 * true protocol and are rejected here.
 */

/**
 * Returns the URL only if it parses to an absolute `http(s)` URL, otherwise null. Used to
 * gate any UGC value that becomes a navigable href — today the project stage `quoteUrls`
 * (always Firebase Storage download URLs in the normal flow, but persisted raw inside the
 * `stages[]` array, which Firestore rules can't validate element-by-element). Allowlisting
 * the PARSED protocol (not the string) is what makes it safe: `javascript:alert(1)` in a
 * fragment/query of an https URL stays inert data, while a `javascript:`/`data:` scheme is
 * dropped. Relative/protocol-relative inputs throw (no base) and are dropped too — quote URLs
 * are always absolute.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

/**
 * Maps a list of UGC URLs to the safe http(s) ones, dropping anything else. Convenience for
 * the common "render only the safe links" case (e.g. a stage's quote attachments).
 */
export function safeExternalUrls(
  raws: readonly (string | null | undefined)[] | undefined,
): string[] {
  return (raws ?? [])
    .map(safeExternalUrl)
    .filter((u): u is string => u !== null);
}
