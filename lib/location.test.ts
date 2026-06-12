import { describe, expect, it } from "vitest";
import { localityLabel, locationParts } from "./location";

describe("locationParts", () => {
  it("orders parts most specific first and drops missing levels", () => {
    expect(
      locationParts({
        address: "Frente al parque",
        admin2: "Liberia",
        admin1: "Guanacaste",
      }),
    ).toEqual(["Frente al parque", "Liberia", "Guanacaste"]);
  });

  it("strips dangling commas and whitespace from geocoder parts", () => {
    expect(locationParts({ address: "La Cajeta De Cutris, " })).toEqual([
      "La Cajeta De Cutris",
    ]);
    expect(locationParts({ admin3: " ,Pital," })).toEqual(["Pital"]);
  });

  it("drops parts that are empty after cleaning", () => {
    expect(locationParts({ address: " , ", admin1: "Alajuela" })).toEqual([
      "Alajuela",
    ]);
  });

  it("returns [] for a missing location", () => {
    expect(locationParts(undefined)).toEqual([]);
  });
});

describe("localityLabel", () => {
  it("joins admin2 and admin1", () => {
    expect(localityLabel({ admin2: "Liberia", admin1: "Guanacaste" })).toBe(
      "Liberia, Guanacaste",
    );
  });

  it("never produces a dangling comma when a level is empty or dirty", () => {
    expect(localityLabel({ admin2: "Liberia," })).toBe("Liberia");
    expect(localityLabel({ admin1: " Guanacaste" })).toBe("Guanacaste");
    expect(localityLabel({})).toBe("");
  });
});
