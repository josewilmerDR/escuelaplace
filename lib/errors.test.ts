import { FirebaseError } from "firebase/app";
import { describe, expect, it, vi } from "vitest";
import { callableErrorMessage, userErrorMessage } from "./errors";

// Both helpers console.error the raw error; silence it so the test output stays clean.
vi.spyOn(console, "error").mockImplementation(() => {});

describe("userErrorMessage", () => {
  it("maps known infra/auth codes to Spanish copy", () => {
    expect(userErrorMessage(new FirebaseError("permission-denied", "x"), "fb")).toMatch(
      /permiso/i,
    );
    expect(userErrorMessage(new FirebaseError("unavailable", "x"), "fb")).toMatch(
      /conexión/i,
    );
  });

  it("falls back for unknown errors", () => {
    expect(userErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
    expect(userErrorMessage(new FirebaseError("functions/internal", "x"), "fallback")).toBe(
      "fallback",
    );
  });
});

describe("callableErrorMessage", () => {
  it("surfaces the function's message verbatim for business error codes", () => {
    for (const code of [
      "functions/failed-precondition",
      "functions/resource-exhausted",
      "functions/invalid-argument",
    ]) {
      expect(
        callableErrorMessage(new FirebaseError(code, "Algunos números ya fueron tomados."), "fb"),
      ).toBe("Algunos números ya fueron tomados.");
    }
  });

  it("falls back to userErrorMessage for infra/auth/unknown errors", () => {
    // functions/internal is developer prose → not surfaced.
    expect(
      callableErrorMessage(new FirebaseError("functions/internal", "INTERNAL"), "fallback"),
    ).toBe("fallback");
    // A mapped infra code still gets its curated copy via the fallback path.
    expect(callableErrorMessage(new FirebaseError("unavailable", "x"), "fallback")).toMatch(
      /conexión/i,
    );
    expect(callableErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
