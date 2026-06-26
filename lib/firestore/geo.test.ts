import { GeoPoint } from "firebase/firestore";
import { geohashForLocation } from "geofire-common";
import { describe, expect, it } from "vitest";
import { toLocation, type LocationInput } from "./geo";

// San José, Costa Rica — baseline for most tests.
const SAN_JOSE: LocationInput = {
  lat: 9.9281,
  lng: -84.0907,
  admin1: "San José",
  admin2: "San José",
  admin3: "Carmen",
};

describe("toLocation", () => {
  it("geopoint carries the exact lat/lng from the input", () => {
    const loc = toLocation(SAN_JOSE);
    expect(loc.geopoint).toBeInstanceOf(GeoPoint);
    expect(loc.geopoint.latitude).toBe(SAN_JOSE.lat);
    expect(loc.geopoint.longitude).toBe(SAN_JOSE.lng);
  });

  it("geohash is deterministic for a given lat/lng (pure local math)", () => {
    const expected = geohashForLocation([SAN_JOSE.lat, SAN_JOSE.lng]);
    expect(toLocation(SAN_JOSE).geohash).toBe(expected);
    // calling again produces the identical hash
    expect(toLocation(SAN_JOSE).geohash).toBe(expected);
  });

  it("moving the pin recomputes a different geohash", () => {
    const cartago: LocationInput = {
      lat: 9.8647,
      lng: -83.9193,
      admin1: "Cartago",
      admin2: "Cartago",
      admin3: "",
    };
    expect(toLocation(SAN_JOSE).geohash).not.toBe(toLocation(cartago).geohash);
  });

  it("address is included when truthy", () => {
    const loc = toLocation({ ...SAN_JOSE, address: "Av 2, San José" });
    expect(loc).toHaveProperty("address", "Av 2, San José");
  });

  it("address is omitted when absent (Firestore rejects undefined)", () => {
    const loc = toLocation(SAN_JOSE); // no address field
    expect(Object.prototype.hasOwnProperty.call(loc, "address")).toBe(false);
  });

  it("address is omitted when empty string (falsy — Firestore guard)", () => {
    const loc = toLocation({ ...SAN_JOSE, address: "" });
    expect(Object.prototype.hasOwnProperty.call(loc, "address")).toBe(false);
  });

  it("country is included when truthy", () => {
    const loc = toLocation({ ...SAN_JOSE, country: "CR" });
    expect(loc).toHaveProperty("country", "CR");
  });

  it("country is omitted when absent (Firestore rejects undefined)", () => {
    const loc = toLocation(SAN_JOSE); // no country field
    expect(Object.prototype.hasOwnProperty.call(loc, "country")).toBe(false);
  });

  it("country is omitted when empty string (falsy — Firestore guard)", () => {
    const loc = toLocation({ ...SAN_JOSE, country: "" });
    expect(Object.prototype.hasOwnProperty.call(loc, "country")).toBe(false);
  });

  it("admin1/admin2/admin3 always pass through with their exact values", () => {
    const loc = toLocation(SAN_JOSE);
    expect(loc.admin1).toBe("San José");
    expect(loc.admin2).toBe("San José");
    expect(loc.admin3).toBe("Carmen");
  });

  it("admin1/admin2/admin3 pass through even when all are empty strings", () => {
    const loc = toLocation({ lat: 0, lng: 0, admin1: "", admin2: "", admin3: "" });
    expect(loc.admin1).toBe("");
    expect(loc.admin2).toBe("");
    expect(loc.admin3).toBe("");
  });

  it("result contains exactly the expected keys when address and country are both provided", () => {
    const loc = toLocation({ ...SAN_JOSE, address: "Av 2", country: "CR" });
    const keys = Object.keys(loc).sort();
    expect(keys).toEqual(
      ["address", "admin1", "admin2", "admin3", "country", "geopoint", "geohash"].sort(),
    );
  });

  it("result contains exactly the expected keys when address and country are both absent", () => {
    const loc = toLocation(SAN_JOSE);
    const keys = Object.keys(loc).sort();
    expect(keys).toEqual(
      ["admin1", "admin2", "admin3", "geopoint", "geohash"].sort(),
    );
  });

  it("works at geographic extremes (equator / prime meridian)", () => {
    const loc = toLocation({ lat: 0, lng: 0, admin1: "", admin2: "", admin3: "" });
    expect(loc.geopoint.latitude).toBe(0);
    expect(loc.geopoint.longitude).toBe(0);
    expect(typeof loc.geohash).toBe("string");
    expect(loc.geohash.length).toBeGreaterThan(0);
  });

  it("both address and country spread into the same object when provided together", () => {
    const loc = toLocation({ ...SAN_JOSE, address: "Calle 3", country: "CR" });
    expect(loc.address).toBe("Calle 3");
    expect(loc.country).toBe("CR");
  });
});
