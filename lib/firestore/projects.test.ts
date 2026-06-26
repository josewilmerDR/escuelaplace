import { describe, expect, it } from "vitest";
import {
  buildPageantFundProjectInput,
  canFundProject,
  isGoalReached,
  projectGoal,
  projectProgress,
} from "./projects";

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

describe("projectGoal", () => {
  it("sums the costs of all stages", () => {
    expect(projectGoal([{ cost: 100 }, { cost: 250 }, { cost: 50 }])).toBe(400);
  });

  it("returns 0 when stages is undefined", () => {
    expect(projectGoal(undefined)).toBe(0);
  });

  it("returns 0 when stages is an empty array", () => {
    expect(projectGoal([])).toBe(0);
  });

  it("treats a stage with cost 0 as contributing 0", () => {
    expect(projectGoal([{ cost: 0 }, { cost: 500 }])).toBe(500);
  });

  it("treats a stage with a falsy/missing cost as contributing 0", () => {
    // A stage whose cost property is undefined (e.g. partially filled form).
    expect(projectGoal([{ cost: undefined as unknown as number }, { cost: 200 }])).toBe(200);
  });

  it("handles a single stage", () => {
    expect(projectGoal([{ cost: 75000 }])).toBe(75000);
  });
});

describe("projectProgress", () => {
  it("returns 0 when goal is 0 (divide-by-zero guard)", () => {
    expect(projectProgress(0, 0)).toBe(0);
  });

  it("returns 0 when goal is negative", () => {
    expect(projectProgress(100, -1)).toBe(0);
  });

  it("returns 0 when nothing has been raised", () => {
    expect(projectProgress(0, 1000)).toBe(0);
  });

  it("returns the exact fraction for a partial raise", () => {
    expect(projectProgress(250, 1000)).toBe(0.25);
  });

  it("returns 1 when raised equals goal", () => {
    expect(projectProgress(1000, 1000)).toBe(1);
  });

  it("clamps to 1 when raised exceeds goal", () => {
    expect(projectProgress(1500, 1000)).toBe(1);
  });

  it("returns a midpoint fraction correctly", () => {
    expect(projectProgress(1, 2)).toBe(0.5);
  });
});

describe("isGoalReached", () => {
  it("returns false when goal is 0", () => {
    expect(isGoalReached(0, 0)).toBe(false);
  });

  it("returns false when raised is 0 and goal is positive", () => {
    expect(isGoalReached(0, 1000)).toBe(false);
  });

  it("returns false when raised is below goal", () => {
    expect(isGoalReached(999, 1000)).toBe(false);
  });

  it("returns true when raised exactly equals goal", () => {
    expect(isGoalReached(1000, 1000)).toBe(true);
  });

  it("returns true when raised exceeds goal", () => {
    expect(isGoalReached(1500, 1000)).toBe(true);
  });

  it("returns false when goal is negative (goal <= 0 guard)", () => {
    expect(isGoalReached(5, -1)).toBe(false);
  });
});

describe("canFundProject", () => {
  it("returns true when school is verified and project is active", () => {
    expect(
      canFundProject(
        { verificationStatus: "verified" },
        { status: "active" },
      ),
    ).toBe(true);
  });

  it("returns false when school is pending (not verified)", () => {
    expect(
      canFundProject(
        { verificationStatus: "pending" },
        { status: "active" },
      ),
    ).toBe(false);
  });

  it("returns false when school needs_reverification", () => {
    expect(
      canFundProject(
        { verificationStatus: "needs_reverification" },
        { status: "active" },
      ),
    ).toBe(false);
  });

  it("returns false when project is completed even if school is verified", () => {
    expect(
      canFundProject(
        { verificationStatus: "verified" },
        { status: "completed" },
      ),
    ).toBe(false);
  });

  it("returns false when project is cancelled even if school is verified", () => {
    expect(
      canFundProject(
        { verificationStatus: "verified" },
        { status: "cancelled" },
      ),
    ).toBe(false);
  });

  it("returns false when both school is unverified and project is not active", () => {
    expect(
      canFundProject(
        { verificationStatus: "pending" },
        { status: "completed" },
      ),
    ).toBe(false);
  });
});
