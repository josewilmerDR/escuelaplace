import { describe, expect, it } from "vitest";
import { validateProofFile } from "./files";

/** Build a File whose `type` and `size` drive the validation (content is irrelevant). */
function fileOf(type: string, sizeBytes: number): File {
  const file = new File(["x"], "proof", { type });
  // jsdom's File derives size from the blob parts; override it so we can test the cap
  // without allocating multi-MB buffers.
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

const MB = 1024 * 1024;

describe("validateProofFile", () => {
  it("accepts an image under the size cap", () => {
    expect(validateProofFile(fileOf("image/jpeg", 1 * MB))).toBeNull();
    expect(validateProofFile(fileOf("image/png", 2 * MB))).toBeNull();
  });

  it("accepts a PDF under the size cap", () => {
    expect(validateProofFile(fileOf("application/pdf", 3 * MB))).toBeNull();
  });

  it("rejects a non-image, non-PDF type", () => {
    expect(validateProofFile(fileOf("text/plain", 1 * MB))).toMatch(/imagen.*PDF/);
    expect(validateProofFile(fileOf("application/zip", 1 * MB))).toMatch(/imagen.*PDF/);
  });

  it("rejects a file over the 5 MB cap", () => {
    expect(validateProofFile(fileOf("application/pdf", 6 * MB))).toMatch(/5 MB/);
    expect(validateProofFile(fileOf("image/png", 6 * MB))).toMatch(/5 MB/);
  });

  it("accepts a file exactly at the cap (boundary is inclusive)", () => {
    expect(validateProofFile(fileOf("image/png", 5 * MB))).toBeNull();
  });
});
