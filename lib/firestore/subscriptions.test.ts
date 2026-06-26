import { describe, expect, it } from "vitest";
import { supporterNameOf, subscriptionProofPath } from "./subscriptions";
import type { Subscription } from "@/types";

// Minimal fixture type — only the fields these pure helpers read.
type SupporterNameInput = Pick<
  Subscription,
  "supporterType" | "businessName" | "donorName"
>;

describe("supporterNameOf", () => {
  it("returns donorName when supporterType is 'user'", () => {
    const sub: SupporterNameInput = {
      supporterType: "user",
      donorName: "Ana García",
      businessName: "Comercio XYZ",
    };
    expect(supporterNameOf(sub)).toBe("Ana García");
  });

  it("returns businessName when supporterType is 'business'", () => {
    const sub: SupporterNameInput = {
      supporterType: "business",
      businessName: "Ferretería Central",
      donorName: "Ana García",
    };
    expect(supporterNameOf(sub)).toBe("Ferretería Central");
  });

  it("returns businessName when supporterType is absent (legacy doc)", () => {
    // Legacy docs predate the `supporterType` field — treated as 'business'.
    const sub: SupporterNameInput = {
      supporterType: undefined,
      businessName: "Panadería El Sol",
    };
    expect(supporterNameOf(sub)).toBe("Panadería El Sol");
  });

  it("returns '—' when supporterType is 'user' but donorName is undefined", () => {
    const sub: SupporterNameInput = {
      supporterType: "user",
      donorName: undefined,
      businessName: "Some Business",
    };
    expect(supporterNameOf(sub)).toBe("—");
  });

  it("returns '—' when supporterType is 'business' but businessName is undefined", () => {
    const sub: SupporterNameInput = {
      supporterType: "business",
      businessName: undefined,
    };
    expect(supporterNameOf(sub)).toBe("—");
  });

  it("returns '—' when supporterType is absent and businessName is undefined", () => {
    const sub: SupporterNameInput = {
      supporterType: undefined,
      businessName: undefined,
    };
    expect(supporterNameOf(sub)).toBe("—");
  });

  it("does NOT return donorName for a 'business' supporter even when donorName is set", () => {
    const sub: SupporterNameInput = {
      supporterType: "business",
      businessName: "Comercio ABC",
      donorName: "Should not appear",
    };
    expect(supporterNameOf(sub)).toBe("Comercio ABC");
  });

  it("does NOT return businessName for a 'user' supporter even when businessName is set", () => {
    const sub: SupporterNameInput = {
      supporterType: "user",
      businessName: "Should not appear",
      donorName: "Juan Pérez",
    };
    expect(supporterNameOf(sub)).toBe("Juan Pérez");
  });
});

describe("subscriptionProofPath", () => {
  it("builds the expected Storage path for a given subscription id", () => {
    expect(subscriptionProofPath("abc123")).toBe(
      "subscription-proofs/abc123/proof",
    );
  });

  it("preserves an id that contains hyphens", () => {
    expect(subscriptionProofPath("sub-id-2024")).toBe(
      "subscription-proofs/sub-id-2024/proof",
    );
  });

  it("preserves an id that is a Firestore auto-id (20 alphanumeric chars)", () => {
    const autoId = "A1b2C3d4E5f6G7h8I9j0";
    expect(subscriptionProofPath(autoId)).toBe(
      `subscription-proofs/${autoId}/proof`,
    );
  });

  it("always starts with 'subscription-proofs/'", () => {
    expect(subscriptionProofPath("any-id")).toMatch(
      /^subscription-proofs\//,
    );
  });

  it("always ends with '/proof'", () => {
    expect(subscriptionProofPath("any-id")).toMatch(/\/proof$/);
  });

  it("segments the path as subscription-proofs / id / proof (three parts)", () => {
    const parts = subscriptionProofPath("myId").split("/");
    expect(parts).toEqual(["subscription-proofs", "myId", "proof"]);
  });
});
