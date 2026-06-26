import { describe, expect, it } from "vitest";
import { isSchoolVerified, paymentMethodsOf, schoolCover } from "./schools";

describe("schoolCover", () => {
  it("prefers the explicit cover over everything else", () => {
    expect(
      schoolCover({
        coverUrl: "cover.jpg",
        photos: ["gallery.jpg"],
        photoUrl: "profile.jpg",
      }),
    ).toBe("cover.jpg");
  });

  it("falls back to the first gallery photo when there is no cover", () => {
    expect(
      schoolCover({
        coverUrl: undefined,
        photos: ["first.jpg", "second.jpg"],
        photoUrl: "profile.jpg",
      }),
    ).toBe("first.jpg");
  });

  it("falls back to the profile photo when there is no cover or gallery", () => {
    expect(
      schoolCover({
        coverUrl: undefined,
        photos: [],
        photoUrl: "profile.jpg",
      }),
    ).toBe("profile.jpg");
  });

  it("returns undefined when the school has no images at all", () => {
    expect(
      schoolCover({
        coverUrl: undefined,
        photos: undefined,
        photoUrl: undefined,
      }),
    ).toBeUndefined();
  });
});

describe("isSchoolVerified", () => {
  it("returns true when verificationStatus is 'verified'", () => {
    expect(isSchoolVerified({ verificationStatus: "verified" })).toBe(true);
  });

  it("returns false when verificationStatus is 'pending'", () => {
    expect(isSchoolVerified({ verificationStatus: "pending" })).toBe(false);
  });

  it("returns false when verificationStatus is 'needs_reverification'", () => {
    expect(
      isSchoolVerified({ verificationStatus: "needs_reverification" }),
    ).toBe(false);
  });
});

describe("paymentMethodsOf", () => {
  it("returns paymentMethods array when present and non-empty", () => {
    const methods = [
      { label: "Cuenta bancaria", value: "CR05 1234 5678" },
      { label: "SINPE Móvil", value: "88881234" },
    ];
    expect(paymentMethodsOf({ paymentMethods: methods })).toEqual(methods);
  });

  it("returns an empty array when paymentMethods is empty and sinpe is absent", () => {
    expect(paymentMethodsOf({ paymentMethods: [] })).toEqual([]);
  });

  it("returns an empty array when priv is null", () => {
    expect(paymentMethodsOf(null)).toEqual([]);
  });

  it("returns an empty array when priv is undefined", () => {
    expect(paymentMethodsOf(undefined)).toEqual([]);
  });

  it("returns an empty array when priv has no paymentMethods and no sinpe", () => {
    expect(paymentMethodsOf({})).toEqual([]);
  });

  it("normalizes a legacy sinpe with accountHolder into a single 'SINPE Móvil' entry", () => {
    expect(
      paymentMethodsOf({
        sinpe: { number: "88881234", accountHolder: "Juan Pérez" },
      }),
    ).toEqual([{ label: "SINPE Móvil", value: "88881234 (Juan Pérez)" }]);
  });

  it("normalizes a legacy sinpe without accountHolder to the bare number", () => {
    expect(
      paymentMethodsOf({
        sinpe: { number: "88881234", accountHolder: "" },
      }),
    ).toEqual([{ label: "SINPE Móvil", value: "88881234" }]);
  });

  it("prefers paymentMethods over legacy sinpe when both are present", () => {
    const methods = [{ label: "PayPal", value: "junta@escuela.org" }];
    expect(
      paymentMethodsOf({
        paymentMethods: methods,
        sinpe: { number: "88881234", accountHolder: "Juan Pérez" },
      }),
    ).toEqual(methods);
  });

  it("falls through to sinpe when paymentMethods is present but empty", () => {
    expect(
      paymentMethodsOf({
        paymentMethods: [],
        sinpe: { number: "77772222", accountHolder: "María López" },
      }),
    ).toEqual([{ label: "SINPE Móvil", value: "77772222 (María López)" }]);
  });
});
