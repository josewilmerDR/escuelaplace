import { describe, expect, it } from "vitest";
import { schoolCover } from "./schools";

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
