import { describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";
import { auditCollusionFlag, auditEventLabel, formatAuditWhen } from "./audit";

describe("auditCollusionFlag", () => {
  it("ranks self-confirmation above self-dealing", () => {
    expect(
      auditCollusionFlag({ confirmerIsSupporter: true, selfDealt: true }),
    ).toBe("self_confirm");
  });

  it("flags self-dealing when only the administrator is shared", () => {
    expect(
      auditCollusionFlag({ confirmerIsSupporter: false, selfDealt: true }),
    ).toBe("self_deal");
  });

  it("returns null when clean", () => {
    expect(
      auditCollusionFlag({ confirmerIsSupporter: false, selfDealt: false }),
    ).toBeNull();
  });
});

describe("auditEventLabel", () => {
  it("labels a business support confirmation", () => {
    expect(
      auditEventLabel({ type: "subscription_confirmed", supporterType: "business" }),
    ).toBe("Apoyo de comercio");
  });

  it("labels a personal donation", () => {
    expect(
      auditEventLabel({ type: "subscription_confirmed", supporterType: "user" }),
    ).toBe("Donación personal");
  });

  it("distinguishes in-kind from money project contributions", () => {
    expect(
      auditEventLabel({
        type: "project_contribution_confirmed",
        supporterType: "user",
        contributionType: "in_kind",
      }),
    ).toBe("Donación en especie a proyecto");
    expect(
      auditEventLabel({
        type: "project_contribution_confirmed",
        supporterType: "user",
        contributionType: "money",
      }),
    ).toBe("Aporte a proyecto");
  });
});

describe("formatAuditWhen", () => {
  const stamp = (iso: string) =>
    ({ toDate: () => new Date(iso) }) as unknown as Timestamp;

  it("prefers confirmedAt over createdAt", () => {
    const out = formatAuditWhen({
      confirmedAt: stamp("2026-01-15T10:00:00Z"),
      createdAt: stamp("2020-01-01T00:00:00Z"),
    });
    expect(out).not.toBe("—");
    expect(out).toContain("26");
  });

  it("falls back to createdAt when confirmedAt is null", () => {
    expect(
      formatAuditWhen({ confirmedAt: null, createdAt: stamp("2026-01-15T10:00:00Z") }),
    ).not.toBe("—");
  });

  it("returns an em dash when no timestamp is present", () => {
    // createdAt is non-null in the type; a legacy/missing stamp is the case under test.
    const evNoStamp = { confirmedAt: null, createdAt: null } as unknown as Parameters<
      typeof formatAuditWhen
    >[0];
    expect(formatAuditWhen(evNoStamp)).toBe("—");
  });
});
