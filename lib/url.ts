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

/**
 * Hosts whose media we trust to load into a `<video>`/`<source src>` (or any RESOURCE sink — a
 * resource sink can't execute `javascript:`, but it CAN fetch an arbitrary off-domain file). Mirrors
 * `next.config.ts` `images.remotePatterns`, which already gates every `<img>`: production serves only
 * the Firebase Storage bucket; dev also serves the loopback Storage emulator. A `<video>`/`<source>`
 * bypasses the next/image optimizer entirely, so this is the equivalent host gate for the video class.
 */
const MEDIA_HOSTS: ReadonlySet<string> =
  process.env.NODE_ENV === "production"
    ? new Set(["firebasestorage.googleapis.com"])
    : new Set([
        "firebasestorage.googleapis.com",
        "127.0.0.1:9199",
        "localhost:9199",
      ]);

/**
 * Returns a media URL only if it is safe to drop into a `<video>`/`<source src>`: an absolute
 * http(s) URL hosted on a known Firebase Storage host (see `MEDIA_HOSTS`), otherwise null. Every
 * clip on the platform is uploaded to our own Storage bucket, so a video URL on any other host is
 * either legacy garbage or a forged write (the value persists raw inside a tool `config`/`media`
 * map or a project `stages[]` array, none of which Firestore rules can validate element-by-element)
 * — either way we don't fetch it. Scheme-checking alone (safeExternalUrl) wouldn't stop an
 * off-domain `https://evil.example/track.mp4`; the host allowlist is what closes that, matching the
 * gate next/image already enforces for images. NOT for local `blob:` editor previews — those are the
 * owner's own freshly-picked file and never persisted, so they stay raw (callers don't gate them).
 */
export function safeMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return MEDIA_HOSTS.has(url.host) ? url.href : null;
}
