import { describe, expect, it } from "vitest";
import {
  toCandidatesInput,
  type PageantCandidateDraft,
} from "./PageantCandidatesFields";

/** A draft row with sensible defaults; override only what the case cares about. */
function draft(over: Partial<PageantCandidateDraft>): PageantCandidateDraft {
  return { _key: 0, name: "", bio: "", juryScore: "0", photoFile: null, ...over };
}

describe("toCandidatesInput", () => {
  it("accepts an empty roster (candidaturas are optional at creation)", () => {
    const r = toCandidatesInput([]);
    expect(r).toEqual({ ok: true, rows: [] });
  });

  it("drops entirely-empty rows so an accidental blank row never blocks creation", () => {
    const r = toCandidatesInput([
      draft({ _key: 1, name: "Ana" }),
      draft({ _key: 2 }), // blank — no name, no bio, no photo
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].name).toBe("Ana");
    }
  });

  it("rejects a row that has content but no name", () => {
    const r = toCandidatesInput([draft({ name: "  ", bio: "se postula por la gira" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Cada candidatura necesita un nombre.");
  });

  it("trims text and clamps the jury score to the integer 0..100", () => {
    const r = toCandidatesInput([
      draft({ name: "  María  ", bio: "  talento  ", juryScore: "150" }),
      draft({ name: "Luis", juryScore: "-5" }),
      draft({ name: "Sofía", juryScore: "73.6" }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows[0]).toMatchObject({ name: "María", bio: "talento", juryScore: 100 });
      expect(r.rows[1].juryScore).toBe(0);
      expect(r.rows[2].juryScore).toBe(74);
    }
  });

  it("preserves form order in the kept rows (it becomes the roster order)", () => {
    const r = toCandidatesInput([
      draft({ name: "Primera" }),
      draft({}), // dropped
      draft({ name: "Segunda" }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows.map((c) => c.name)).toEqual(["Primera", "Segunda"]);
  });
});
