import { describe, expect, it } from "vitest";
import { applaudedCandidateId } from "./preferences";
import type { BuyerPreferences } from "@/types";

describe("applaudedCandidateId", () => {
  it("returns the stored candidate id for a matching toolId", () => {
    const prefs: BuyerPreferences = {
      pageantApplause: { "tool-1": "candidate-abc" },
    };
    expect(applaudedCandidateId(prefs, "tool-1")).toBe("candidate-abc");
  });

  it("returns undefined when the toolId has no entry in pageantApplause", () => {
    const prefs: BuyerPreferences = {
      pageantApplause: { "tool-1": "candidate-abc" },
    };
    expect(applaudedCandidateId(prefs, "tool-99")).toBeUndefined();
  });

  it("returns undefined when pageantApplause map is absent", () => {
    const prefs: BuyerPreferences = {};
    expect(applaudedCandidateId(prefs, "tool-1")).toBeUndefined();
  });

  it("returns undefined when pageantApplause is an empty map", () => {
    const prefs: BuyerPreferences = { pageantApplause: {} };
    expect(applaudedCandidateId(prefs, "tool-1")).toBeUndefined();
  });

  it("handles multiple toolIds and returns the correct candidate for each", () => {
    const prefs: BuyerPreferences = {
      pageantApplause: {
        "tool-a": "cand-1",
        "tool-b": "cand-2",
        "tool-c": "cand-3",
      },
    };
    expect(applaudedCandidateId(prefs, "tool-a")).toBe("cand-1");
    expect(applaudedCandidateId(prefs, "tool-b")).toBe("cand-2");
    expect(applaudedCandidateId(prefs, "tool-c")).toBe("cand-3");
  });

  it("ignores other preference fields and still reads pageantApplause correctly", () => {
    const prefs: BuyerPreferences = {
      schoolId: "school-x",
      schoolName: "Escuela Test",
      pickerHidden: true,
      deviceKey: "device-uuid-123",
      pageantApplause: { "tool-z": "candidate-z" },
    };
    expect(applaudedCandidateId(prefs, "tool-z")).toBe("candidate-z");
  });

  it("returns undefined for an empty toolId string when that key is absent", () => {
    const prefs: BuyerPreferences = {
      pageantApplause: { "tool-1": "cand-1" },
    };
    expect(applaudedCandidateId(prefs, "")).toBeUndefined();
  });

  it("returns the value stored under an empty string key if it exists", () => {
    const prefs: BuyerPreferences = {
      pageantApplause: { "": "cand-empty-key" },
    };
    expect(applaudedCandidateId(prefs, "")).toBe("cand-empty-key");
  });
});
