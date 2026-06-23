import { describe, expect, it } from "vitest";
import {
  completedYears as functionsCompletedYears,
  isSpecialThankYouYear as functionsIsSpecialYear,
  planThankYou as functionsPlanThankYou,
  renderThankYou as functionsRenderThankYou,
} from "../functions/src/thanks";
import type { ThankYouConfig } from "@/types";
import {
  YEAR_MS,
  completedYears,
  isSpecialThankYouYear,
  planThankYou,
  renderThankYou,
} from "./thanks";

describe("completedYears", () => {
  it("returns 0 before the first full year (and for non-positive spans)", () => {
    expect(completedYears(1000, 1000)).toBe(0);
    expect(completedYears(1000, 500)).toBe(0);
    expect(completedYears(0, YEAR_MS - 1)).toBe(0);
  });

  it("counts each completed year, ignoring the partial remainder", () => {
    expect(completedYears(0, YEAR_MS)).toBe(1);
    expect(completedYears(0, YEAR_MS * 1.9)).toBe(1);
    expect(completedYears(0, YEAR_MS * 5)).toBe(5);
  });
});

describe("isSpecialThankYouYear", () => {
  it("is true only for a listed year", () => {
    expect(isSpecialThankYouYear(1, [1, 5])).toBe(true);
    expect(isSpecialThankYouYear(5, [1, 5])).toBe(true);
    expect(isSpecialThankYouYear(2, [1, 5])).toBe(false);
  });
});

describe("renderThankYou", () => {
  it("substitutes every name token", () => {
    expect(renderThankYou("Gracias {nombre}, {nombre}!", "Ana")).toBe(
      "Gracias Ana, Ana!",
    );
  });

  it("collapses the token when the name is blank, and trims", () => {
    expect(renderThankYou("Hola {nombre}", "  ")).toBe("Hola ");
    expect(renderThankYou("Hola {nombre}", "  Ana  ")).toBe("Hola Ana");
  });

  it("leaves a message without the token untouched", () => {
    expect(renderThankYou("Mil gracias", "Ana")).toBe("Mil gracias");
  });
});

describe("planThankYou", () => {
  const withWelcome: ThankYouConfig = {
    welcome: { message: "Bienvenida {nombre}" },
    updatedAt: null as never,
  };

  it("welcome auto-sends the template when set", () => {
    const plan = planThankYou("welcome", 0, withWelcome);
    expect(plan).toMatchObject({ create: true, special: true, status: "sent" });
    expect(plan.template?.message).toBe("Bienvenida {nombre}");
  });

  it("welcome prompts the school when no template is set", () => {
    const plan = planThankYou("welcome", 0, null);
    expect(plan).toMatchObject({
      create: true,
      special: true,
      status: "prompted",
      template: null,
    });
  });

  it("renewal is skipped without a template, sent with one", () => {
    expect(planThankYou("renewal", 0, null).create).toBe(false);
    const plan = planThankYou("renewal", 0, {
      renewal: { message: "Un período más, {nombre}" },
      updatedAt: null as never,
    });
    expect(plan).toMatchObject({ create: true, special: false, status: "sent" });
  });

  it("a special anniversary year always prompts (never auto-templated)", () => {
    const plan = planThankYou("anniversary", 1, {
      anniversaryGeneric: { message: "no debería usarse" },
      updatedAt: null as never,
    });
    expect(plan).toMatchObject({
      create: true,
      special: true,
      status: "prompted",
      template: null,
    });
  });

  it("a generic anniversary year sends the generic template, or is skipped", () => {
    expect(planThankYou("anniversary", 2, null).create).toBe(false);
    const plan = planThankYou("anniversary", 2, {
      anniversaryGeneric: { message: "Otro año, {nombre}" },
      updatedAt: null as never,
    });
    expect(plan).toMatchObject({ create: true, special: false, status: "sent" });
  });

  it("honors a custom specialYears list", () => {
    const config: ThankYouConfig = { specialYears: [3], updatedAt: null as never };
    expect(planThankYou("anniversary", 3, config).status).toBe("prompted");
    expect(planThankYou("anniversary", 1, config).create).toBe(false); // 1 no longer special
  });

  it("treats a whitespace-only template as absent", () => {
    const plan = planThankYou("welcome", 0, {
      welcome: { message: "   " },
      updatedAt: null as never,
    });
    expect(plan.status).toBe("prompted");
  });
});

describe("thanks drift guard (app vs Cloud Function)", () => {
  // The functions package can't import app code, so it mirrors these helpers. If the copies
  // diverge, the detector would create thank-yous the web UI disagrees with. Fail loudly —
  // same pattern as the ranking-weight and donor-tier drift guards.
  it("the math/string helpers agree", () => {
    for (const [from, now] of [
      [0, 0],
      [0, YEAR_MS],
      [0, YEAR_MS * 5.5],
      [1000, 500],
    ]) {
      expect(functionsCompletedYears(from, now)).toBe(completedYears(from, now));
    }
    expect(functionsIsSpecialYear(5, [1, 5])).toBe(isSpecialThankYouYear(5, [1, 5]));
    expect(functionsRenderThankYou("Hola {nombre}", "Ana")).toBe(
      renderThankYou("Hola {nombre}", "Ana"),
    );
  });

  it("the milestone plan agrees across cases", () => {
    const configs = [
      null,
      { welcome: { message: "w" }, updatedAt: null },
      { renewal: { message: "r" }, updatedAt: null },
      { anniversaryGeneric: { message: "a" }, specialYears: [1, 5], updatedAt: null },
      { specialYears: [3], updatedAt: null },
    ];
    const cases: [("welcome" | "renewal" | "anniversary"), number][] = [
      ["welcome", 0],
      ["renewal", 0],
      ["anniversary", 1],
      ["anniversary", 2],
      ["anniversary", 3],
      ["anniversary", 5],
    ];
    for (const cfg of configs) {
      for (const [kind, years] of cases) {
        const a = planThankYou(kind, years, cfg as unknown as ThankYouConfig);
        const b = functionsPlanThankYou(kind, years, cfg);
        expect({ create: b.create, special: b.special, status: b.status }).toEqual({
          create: a.create,
          special: a.special,
          status: a.status,
        });
      }
    }
  });
});
