import { describe, expect, it } from "vitest";
import { buildPageantFundProjectInput, projectGoal } from "./projects";

describe("buildPageantFundProjectInput", () => {
  it("derives a single-stage project whose goal equals the typed amount", () => {
    const input = buildPageantFundProjectInput({
      toolTitle: "Reinado 2026",
      cause: "Pintar las aulas",
      currency: "CRC",
      goal: 150000,
    });
    expect(input.title).toBe("Reinado 2026 — costos del evento");
    expect(input.description).toBe("Pintar las aulas");
    expect(input.currency).toBe("CRC");
    expect(input.stages).toHaveLength(1);
    expect(input.stages[0].cost).toBe(150000);
    expect(input.stages[0].justification).toBe("Pintar las aulas");
    // The project goal is the SUM of stage costs — here, the single typed amount.
    expect(projectGoal(input.stages)).toBe(150000);
  });

  it("falls back to a default purpose when no cause is set, and rounds the goal", () => {
    const input = buildPageantFundProjectInput({
      toolTitle: "Reinado del Cole",
      currency: "USD",
      goal: 99.7,
    });
    expect(input.description).toContain("costos de la realización del reinado");
    expect(input.stages[0].justification).toBe(input.description);
    expect(input.stages[0].cost).toBe(100);
  });

  it("treats a blank/whitespace cause as absent", () => {
    const input = buildPageantFundProjectInput({
      toolTitle: "R",
      cause: "   ",
      currency: "CRC",
      goal: 0,
    });
    expect(input.description).toContain("Logística");
    expect(input.stages[0].cost).toBe(0);
  });
});
