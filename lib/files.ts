/**
 * Validation for user-uploaded proof files (payment proofs, stage quotes). A proof may be
 * an image OR a PDF — quotes are often scanned receipts or PDF estimates — so this is the
 * non-image counterpart to ImagePicker's `validateImageFile`. Same shape (returns a Spanish
 * user-facing message, or null when the file is fine) and the same size budget, so every
 * upload validates alike.
 */

const MAX_PROOF_MB = 5;
const MAX_PROOF_BYTES = MAX_PROOF_MB * 1024 * 1024;

/**
 * User-facing error for an unusable proof file (quote/receipt), or null when it's fine.
 * Accepts any image type or a PDF; rejects everything else and anything over the size cap.
 */
export function validateProofFile(file: File): string | null {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    return "El archivo debe ser una imagen (JPG, PNG…) o un PDF.";
  }
  if (file.size > MAX_PROOF_BYTES) {
    return `El archivo no puede superar los ${MAX_PROOF_MB} MB.`;
  }
  return null;
}

/**
 * Synchronous type/size check for a stage video (guided tour). Returns a Spanish message
 * for an unusable file, or null when it's fine. Duration (≤ 1 minute) is checked separately
 * because it can only be read asynchronously from the decoded metadata, so this is the cheap
 * pre-filter that runs before that probe. The byte cap is passed in so it stays defined next
 * to the rest of the tour caps (TOUR_VIDEO_MAX_MB).
 */
export function validateVideoFile(file: File, maxMb: number): string | null {
  if (!file.type.startsWith("video/")) {
    return "El archivo debe ser un video (MP4, MOV…).";
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `El video no puede superar los ${maxMb} MB.`;
  }
  return null;
}
