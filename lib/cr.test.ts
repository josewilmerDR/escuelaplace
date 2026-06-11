import { describe, expect, it } from "vitest";
import { matchProvince } from "./cr";

describe("matchProvince", () => {
  it("maps geocoder naming variants to the canonical province", () => {
    expect(matchProvince("San José")).toBe("San José");
    expect(matchProvince("Provincia de San José")).toBe("San José");
    expect(matchProvince("San Jose Province")).toBe("San José");
    expect(matchProvince("Limon")).toBe("Limón");
  });

  it("returns undefined for non-CR areas or missing input", () => {
    expect(matchProvince("Texas")).toBeUndefined();
    expect(matchProvince("")).toBeUndefined();
    expect(matchProvince(undefined)).toBeUndefined();
  });
});
