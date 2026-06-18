import { describe, expect, it } from "vitest";
import { safeExternalUrl, safeExternalUrls } from "./url";

describe("safeExternalUrl", () => {
  it("keeps a real Firebase Storage download URL unchanged", () => {
    const storage =
      "https://firebasestorage.googleapis.com/v0/b/escuelaplace.appspot.com/o/schools%2Fs1%2Fprojects%2Fp1%2Fquote-123?alt=media&token=2b6d7c1e-0f0a-4a3a-9b2c-9b8e3a1f2c4d";
    expect(safeExternalUrl(storage)).toBe(storage);
  });

  it("keeps plain http(s) URLs", () => {
    expect(safeExternalUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeExternalUrl("http://example.com/")).toBe("http://example.com/");
  });

  it("drops javascript: in any casing", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JAVASCRIPT:alert(1)")).toBeNull();
  });

  it("drops schemes smuggled with whitespace/control chars", () => {
    expect(safeExternalUrl("  javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("\tjavascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("java\tscript:alert(1)")).toBeNull();
    expect(safeExternalUrl("java\nscript:alert(1)")).toBeNull();
    expect(safeExternalUrl("java\rscript:alert(1)")).toBeNull();
    expect(safeExternalUrl("ja\0vascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("​javascript:alert(1)")).toBeNull();
  });

  it("drops other dangerous / non-navigable schemes", () => {
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeExternalUrl("blob:https://example.com/uuid")).toBeNull();
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(safeExternalUrl("mailto:a@b.com")).toBeNull();
    expect(safeExternalUrl("tel:+50688888888")).toBeNull();
  });

  it("drops relative and protocol-relative inputs (quote URLs are always absolute)", () => {
    expect(safeExternalUrl("//evil.com")).toBeNull();
    expect(safeExternalUrl("/path/to/file")).toBeNull();
    expect(safeExternalUrl("evil.com")).toBeNull();
  });

  it("drops empty / nullish input", () => {
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });

  it("keeps an https URL even when 'javascript:' appears as inert query/fragment data", () => {
    // Protocol stays https: → the browser navigates an https URL; the literal substring is
    // never an executable scheme. Allowlisting the parsed protocol (not the string) is why.
    expect(safeExternalUrl("https://example.com/#javascript:alert(1)")).toBe(
      "https://example.com/#javascript:alert(1)",
    );
    expect(safeExternalUrl("https://example.com/?x=javascript:alert(1)")).toBe(
      "https://example.com/?x=javascript:alert(1)",
    );
  });

  it("normalizes the WHATWG backslash quirk to a valid https host (still safe)", () => {
    // For special schemes, backslashes are treated as slashes: this is host substitution,
    // not scheme escalation. Pinned so the normalization is intentional, not a surprise.
    expect(safeExternalUrl("https:/\\example.com")).toBe("https://example.com/");
  });
});

describe("safeExternalUrls", () => {
  it("keeps the safe URLs and drops the rest, preserving order", () => {
    expect(
      safeExternalUrls([
        "https://a.com/1",
        "javascript:alert(1)",
        "https://b.com/2",
        "data:text/html,x",
      ]),
    ).toEqual(["https://a.com/1", "https://b.com/2"]);
  });

  it("returns [] for undefined or all-unsafe input", () => {
    expect(safeExternalUrls(undefined)).toEqual([]);
    expect(safeExternalUrls(["javascript:x", "", null])).toEqual([]);
  });
});
