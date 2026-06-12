import { describe, expect, it } from "vitest";
import {
  buildCatalogUrl,
  buildDirectionsUrl,
  buildFacebookUrl,
  buildInstagramUrl,
  buildPhoneUrl,
  buildWebsiteUrl,
  buildWhatsAppUrl,
  formatPhoneDisplay,
  normalizePhoneInternational,
  whatsAppMessage,
} from "./contact";

describe("normalizePhoneInternational", () => {
  it("prepends 506 to 8-digit local numbers", () => {
    expect(normalizePhoneInternational("88888888")).toBe("50688888888");
  });

  it("strips separators and the + sign", () => {
    expect(normalizePhoneInternational("+506 8888-8888")).toBe("50688888888");
    expect(normalizePhoneInternational("8888 8888")).toBe("50688888888");
  });

  it("strips the 00 international call prefix", () => {
    expect(normalizePhoneInternational("0050688888888")).toBe("50688888888");
  });

  it("keeps numbers that already include a country code", () => {
    expect(normalizePhoneInternational("50688888888")).toBe("50688888888");
    // Mexican mobile: country code other than 506 must pass through untouched.
    expect(normalizePhoneInternational("5215512345678")).toBe("5215512345678");
  });

  it("rejects undialable input", () => {
    expect(normalizePhoneInternational("")).toBeNull();
    expect(normalizePhoneInternational("hola")).toBeNull();
    expect(normalizePhoneInternational("123")).toBeNull();
    // 9 digits: neither a local CR number nor a full international one.
    expect(normalizePhoneInternational("123456789")).toBeNull();
    expect(normalizePhoneInternational("1234567890123456")).toBeNull();
  });
});

describe("formatPhoneDisplay", () => {
  it("formats CR numbers the way locals write them", () => {
    expect(formatPhoneDisplay("8888-8888")).toBe("+506 8888 8888");
    expect(formatPhoneDisplay("+506 8888 8888")).toBe("+506 8888 8888");
  });

  it("keeps other country codes as +E.164", () => {
    expect(formatPhoneDisplay("5215512345678")).toBe("+5215512345678");
  });

  it("rejects undialable input", () => {
    expect(formatPhoneDisplay("hola")).toBeNull();
  });
});

describe("buildCatalogUrl", () => {
  it("normalizes a pasted wa.me/c share link", () => {
    expect(buildCatalogUrl("https://wa.me/c/50688888888")).toBe(
      "https://wa.me/c/50688888888",
    );
    expect(buildCatalogUrl("wa.me/c/50688888888")).toBe(
      "https://wa.me/c/50688888888",
    );
  });

  it("builds the link from a bare number (local CR gets the country code)", () => {
    expect(buildCatalogUrl("8888-8888")).toBe("https://wa.me/c/50688888888");
    expect(buildCatalogUrl("+506 8888 8888")).toBe(
      "https://wa.me/c/50688888888",
    );
  });

  it("rejects input that is neither a catalog link nor a dialable number", () => {
    expect(buildCatalogUrl("hola")).toBeNull();
    expect(buildCatalogUrl("")).toBeNull();
    expect(buildCatalogUrl("https://example.com/catalogo")).toBeNull();
  });
});

describe("whatsAppMessage", () => {
  it("mentions escuelaplace and the business by name", () => {
    const msg = whatsAppMessage("Librería Alfa", false);
    expect(msg).toContain("Librería Alfa");
    expect(msg).toContain("escuelaplace");
  });

  it("asks for the discount when the business has one active", () => {
    expect(whatsAppMessage("Librería Alfa", true)).toContain("descuento");
    expect(whatsAppMessage("Librería Alfa", false)).not.toContain("descuento");
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me link with the prefilled opener", () => {
    const url = buildWhatsAppUrl("8888-8888", "Librería Alfa", false);
    expect(url).not.toBeNull();
    expect(url).toContain("https://wa.me/50688888888?text=");
    expect(url).toContain(encodeURIComponent("escuelaplace"));
    expect(url).toContain(encodeURIComponent("Librería Alfa"));
  });

  it("returns null for unusable numbers", () => {
    expect(buildWhatsAppUrl("no tengo", "Librería Alfa", false)).toBeNull();
  });
});

describe("buildPhoneUrl", () => {
  it("builds a tel link with the country code", () => {
    expect(buildPhoneUrl("2222-2222")).toBe("tel:+50622222222");
  });

  it("returns null for unusable numbers", () => {
    expect(buildPhoneUrl("no tengo")).toBeNull();
  });
});

describe("buildDirectionsUrl", () => {
  it("targets the business coordinates", () => {
    expect(buildDirectionsUrl(9.9356, -84.1545)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=9.9356,-84.1545",
    );
  });
});

describe("buildWebsiteUrl", () => {
  it("adds https to bare domains and appends the UTM params", () => {
    expect(buildWebsiteUrl("miweb.com")).toBe(
      "https://miweb.com/?utm_source=escuelaplace&utm_medium=referral",
    );
  });

  it("preserves existing path and query params", () => {
    expect(buildWebsiteUrl("https://miweb.com/promo?x=1")).toBe(
      "https://miweb.com/promo?x=1&utm_source=escuelaplace&utm_medium=referral",
    );
  });

  it("rejects input that is not a public URL", () => {
    expect(buildWebsiteUrl("")).toBeNull();
    expect(buildWebsiteUrl("no tengo web")).toBeNull();
    // A hostname without a dot can't be a public site.
    expect(buildWebsiteUrl("localhost")).toBeNull();
  });
});

describe("buildInstagramUrl", () => {
  it("builds a profile URL from a handle, with or without @", () => {
    expect(buildInstagramUrl("@libreria.alfa")).toBe(
      "https://www.instagram.com/libreria.alfa",
    );
    expect(buildInstagramUrl("libreria_alfa")).toBe(
      "https://www.instagram.com/libreria_alfa",
    );
  });

  it("passes a full URL through untouched", () => {
    expect(buildInstagramUrl("https://www.instagram.com/libreria.alfa")).toBe(
      "https://www.instagram.com/libreria.alfa",
    );
  });

  it("rejects input that is neither handle nor URL", () => {
    expect(buildInstagramUrl("")).toBeNull();
    expect(buildInstagramUrl("librería alfa")).toBeNull();
    expect(buildInstagramUrl("@")).toBeNull();
  });
});

describe("buildFacebookUrl", () => {
  it("builds a page URL from a slug, including hyphenated ones", () => {
    expect(buildFacebookUrl("Libreria-Alfa-12345")).toBe(
      "https://www.facebook.com/Libreria-Alfa-12345",
    );
  });

  it("passes a full URL through untouched", () => {
    expect(buildFacebookUrl("https://www.facebook.com/libreria.alfa")).toBe(
      "https://www.facebook.com/libreria.alfa",
    );
  });

  it("rejects input that is neither slug nor URL", () => {
    expect(buildFacebookUrl("librería alfa")).toBeNull();
  });
});
