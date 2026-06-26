import { describe, expect, it } from "vitest";
import {
  PAGEANT_DEFAULT_CROWN_FORMULA,
  type CandidateDoc,
  type CandidateMediaItem,
  type PageantConfig,
} from "@/types";
import {
  candidateCoverUrl,
  candidateMediaOf,
  effectiveWeights,
  pageantStandings,
} from "./pageant";

/** A minimal config carrying only what the helpers read. */
function config(
  crownFormula: PageantConfig["crownFormula"],
  freeVotingEnabled: boolean,
): Pick<PageantConfig, "crownFormula" | "freeVotingEnabled"> {
  return { crownFormula, freeVotingEnabled };
}

/** A roster candidate with only the fields the standings read. */
function candidate(
  id: string,
  juryScore: number,
  voteSupport: number,
  voteFree: number,
): Pick<CandidateDoc, "id" | "juryScore" | "voteSupport" | "voteFree"> {
  return { id, juryScore, voteSupport, voteFree };
}

describe("effectiveWeights", () => {
  it("passes the weights through when free voting is on", () => {
    const w = effectiveWeights(config({ jury: 50, support: 30, sympathy: 20 }, true));
    expect(w).toEqual({ jury: 50, support: 30, sympathy: 20 });
  });

  it("drops the sympathy axis and renormalizes jury/support to 100 when free voting is off", () => {
    const w = effectiveWeights(config({ jury: 50, support: 30, sympathy: 20 }, false));
    expect(w.sympathy).toBe(0);
    expect(w.jury + w.support).toBeCloseTo(100);
    // 50:30 keeps its ratio after renormalizing → 62.5 : 37.5.
    expect(w.jury).toBeCloseTo(62.5);
    expect(w.support).toBeCloseTo(37.5);
  });

  it("does not divide by zero when both remaining weights are zero and free voting is off", () => {
    const w = effectiveWeights(config({ jury: 0, support: 0, sympathy: 100 }, false));
    expect(w).toEqual({ jury: 0, support: 0, sympathy: 0 });
  });

  it("ships a default formula that sums to 100 and stays jury-led", () => {
    const { jury, support, sympathy } = PAGEANT_DEFAULT_CROWN_FORMULA;
    expect(jury + support + sympathy).toBe(100);
    // Jury is the single largest axis, so neither community axis can outweigh it alone.
    expect(jury).toBeGreaterThanOrEqual(support);
    expect(jury).toBeGreaterThanOrEqual(sympathy);
  });
});

describe("pageantStandings", () => {
  it("returns an empty list for an empty roster", () => {
    expect(pageantStandings(config(PAGEANT_DEFAULT_CROWN_FORMULA, true), [])).toEqual([]);
  });

  it("normalizes each axis to the roster max and weights it (composite 0..100)", () => {
    // jury 60 / support 40 / sympathy 0 (free voting off → sympathy dropped, but here it's on with
    // sympathy 0 to isolate the two economic-ish axes).
    const standings = pageantStandings(config({ jury: 60, support: 40, sympathy: 0 }, true), [
      candidate("a", 100, 0, 0), // jury leader
      candidate("b", 0, 50, 0), // support leader
    ]);
    const a = standings.find((s) => s.candidateId === "a")!;
    const b = standings.find((s) => s.candidateId === "b")!;
    // a leads jury (norm 1 → 60) and has no support; b leads support (norm 1 → 40) and no jury.
    expect(a.composite).toBeCloseTo(60);
    expect(b.composite).toBeCloseTo(40);
    expect(a.parts).toEqual({ jury: 60, support: 0, sympathy: 0 });
  });

  it("orders by composite, highest first", () => {
    const standings = pageantStandings(config({ jury: 100, support: 0, sympathy: 0 }, true), [
      candidate("low", 10, 0, 0),
      candidate("high", 90, 0, 0),
      candidate("mid", 50, 0, 0),
    ]);
    expect(standings.map((s) => s.candidateId)).toEqual(["high", "mid", "low"]);
  });

  it("scores every candidate 0 on an all-zero axis without dividing by zero", () => {
    const standings = pageantStandings(config({ jury: 0, support: 100, sympathy: 0 }, true), [
      candidate("a", 0, 0, 0),
      candidate("b", 0, 0, 0),
    ]);
    expect(standings.every((s) => s.composite === 0)).toBe(true);
  });

  it("ignores the free-applause axis in the standings when free voting is off", () => {
    const cfg = config({ jury: 0, support: 0, sympathy: 100 }, false);
    const standings = pageantStandings(cfg, [
      candidate("a", 0, 0, 1000), // huge applause, but sympathy weight is dropped
      candidate("b", 0, 0, 0),
    ]);
    expect(standings.every((s) => s.composite === 0)).toBe(true);
  });
});

describe("candidateMediaOf", () => {
  const media: CandidateMediaItem[] = [
    { type: "image", url: "a.jpg" },
    { type: "video", url: "b.mp4" },
  ];

  it("returns the media list verbatim when present (the source of truth)", () => {
    expect(candidateMediaOf({ media })).toEqual(media);
  });

  it("prefers media over a legacy photoUrl when both exist", () => {
    expect(candidateMediaOf({ media, photoUrl: "legacy.jpg" })).toEqual(media);
  });

  it("normalizes a legacy photoUrl into a one-image carousel", () => {
    expect(candidateMediaOf({ photoUrl: "legacy.jpg" })).toEqual([
      { type: "image", url: "legacy.jpg" },
    ]);
  });

  it("treats an empty media array as legacy (falls back to photoUrl)", () => {
    expect(candidateMediaOf({ media: [], photoUrl: "legacy.jpg" })).toEqual([
      { type: "image", url: "legacy.jpg" },
    ]);
  });

  it("returns an empty list for a candidate with neither media nor photo", () => {
    expect(candidateMediaOf({})).toEqual([]);
  });
});

describe("candidateCoverUrl", () => {
  it("uses the first IMAGE of the carousel, skipping a leading video", () => {
    expect(
      candidateCoverUrl({
        media: [
          { type: "video", url: "intro.mp4" },
          { type: "image", url: "face.jpg" },
        ],
      }),
    ).toBe("face.jpg");
  });

  it("falls back to the legacy photoUrl when there is no media", () => {
    expect(candidateCoverUrl({ photoUrl: "legacy.jpg" })).toBe("legacy.jpg");
  });

  it("is undefined for a video-only candidate (no cover image)", () => {
    expect(candidateCoverUrl({ media: [{ type: "video", url: "only.mp4" }] })).toBeUndefined();
  });

  it("is undefined for a candidate with no media at all", () => {
    expect(candidateCoverUrl({})).toBeUndefined();
  });
});
