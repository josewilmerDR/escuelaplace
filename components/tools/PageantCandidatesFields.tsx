"use client";

/**
 * The candidate roster inputs for the CREATE form of a reinado ("Reinado") — the seam that lets the
 * board add candidaturas DURING creation instead of only afterwards on the edit page (less friction,
 * one mental step). Controlled like the other create-form editors (value + onChange), but the roster
 * is a SUBCOLLECTION, not part of PageantConfig, so it can't ride along in the single createTool
 * write: instead the drafts are collected here and persisted right AFTER the tool is created, with
 * `persistPageantCandidates`, against the create page's pre-allocated tool id (the same id the
 * candidate photos upload under). This mirrors how the bingo copies its mazo after creation.
 *
 * Unlike PageantCandidatesEditor (the edit page, where each candidate has its own Save button because
 * the tool already exists), there are NO per-row saves here: the whole roster commits with the single
 * "Crear reinado" submit. The four tally fields are Cloud-Function-maintained and never touched.
 * PURELY INFORMATIONAL — the platform never processes money.
 */
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrashIcon } from "@/components/ui/icons";
import { CandidateFields, clampScore } from "@/components/tools/CandidateFields";
import { createCandidate, uploadToolStageAsset } from "@/lib/firestore";
import { PAGEANT_CANDIDATES_MAX } from "@/types";

/** One candidate being drafted on the create form: a stable local key for React, the editable values
 * (jury score as a string, the freshly picked photo file), persisted only on submit. */
export interface PageantCandidateDraft {
  _key: number;
  name: string;
  bio: string;
  /** Not edited at creation (the jury hasn't scored yet) — stays "0" and is filled later on the edit
   * page. Kept here so a draft is a complete candidate and persists with juryScore 0. */
  juryScore: string;
  photoFile: File | null;
}

/** The create form starts with an empty roster — the board adds the first candidate with the button. */
export function emptyPageantCandidates(): PageantCandidateDraft[] {
  return [];
}

/** A normalized candidate ready to persist: trimmed text, the integer jury score, the photo to upload. */
export interface NormalizedCandidate {
  name: string;
  bio: string;
  juryScore: number;
  photoFile: File | null;
}

/**
 * Validate + normalize the drafts before the tool is created. Entirely-empty rows (no name, no bio,
 * no photo) are dropped so an accidental blank row never blocks creation; every remaining row needs a
 * name (Spanish error otherwise). Order is the kept-row index, so the public roster mirrors the form.
 */
export function toCandidatesInput(
  drafts: PageantCandidateDraft[],
): { ok: true; rows: NormalizedCandidate[] } | { ok: false; error: string } {
  const rows: NormalizedCandidate[] = [];
  for (const d of drafts) {
    const name = d.name.trim();
    const bio = d.bio.trim();
    // An untouched row the board added and left blank — ignore it rather than reject the whole form.
    if (!name && !bio && !d.photoFile) continue;
    if (!name) return { ok: false, error: "Cada candidatura necesita un nombre." };
    rows.push({ name, bio, juryScore: clampScore(d.juryScore), photoFile: d.photoFile });
  }
  return { ok: true, rows };
}

/**
 * Persist a normalized roster against a just-created reinado: upload each candidate's photo (if any)
 * to the tool's asset path, then create the candidate doc with the four tallies forced to 0 (the
 * rules require it) and `order` = position. Sequential so the order is deterministic; rosters are
 * small (≤ PAGEANT_CANDIDATES_MAX). The caller treats this as best-effort: the reinado already
 * exists, so a mid-roster failure just lands the board on the edit page to finish the rest.
 */
export async function persistPageantCandidates(
  schoolId: string,
  toolId: string,
  rows: NormalizedCandidate[],
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let photoUrl: string | undefined;
    if (row.photoFile) {
      photoUrl = await uploadToolStageAsset(schoolId, toolId, "photo", row.photoFile);
    }
    await createCandidate(schoolId, toolId, {
      name: row.name,
      bio: row.bio,
      order: i,
      juryScore: row.juryScore,
      ...(photoUrl ? { photoUrl } : {}),
    });
  }
}

export function PageantCandidatesFields({
  value,
  onChange,
}: {
  value: PageantCandidateDraft[];
  /** A functional setter (the page passes setPageantCandidates directly). */
  onChange: Dispatch<SetStateAction<PageantCandidateDraft[]>>;
}) {
  const [pendingDelete, setPendingDelete] = useState<PageantCandidateDraft | null>(null);
  // Deterministic monotonic counter for stable React keys (no Math.random/Date.now → SSR-safe).
  const nextKey = useRef(0);

  const patchRow = (key: number, patch: Partial<PageantCandidateDraft>) =>
    onChange((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const addRow = () =>
    onChange((prev) => [
      ...prev,
      { _key: nextKey.current++, name: "", bio: "", juryScore: "0", photoFile: null },
    ]);

  const removeRow = (key: number) => {
    onChange((prev) => prev.filter((r) => r._key !== key));
    setPendingDelete(null);
  };

  /** "Quitar": a row with any content is confirmed first; an empty one is dropped immediately. */
  const onRemoveClick = (row: PageantCandidateDraft) => {
    if (row.name.trim() || row.bio.trim() || row.photoFile) setPendingDelete(row);
    else removeRow(row._key);
  };

  return (
    <div className="flex flex-col gap-4">
      {value.map((row, i) => (
        <div key={row._key} className="rounded-2xl bg-background p-4 ring-1 ring-black/5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Candidatura {i + 1}</p>
            {/* Text on desktop, a trash icon on mobile (saves header width); the aria-label keeps the
                accessible name when icon-only. The photo's own "Cambiar" handles changing the image. */}
            <button
              type="button"
              onClick={() => onRemoveClick(row)}
              aria-label="Eliminar candidatura"
              className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
            >
              <TrashIcon className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Eliminar candidatura</span>
            </button>
          </div>
          <CandidateFields
            value={{
              name: row.name,
              bio: row.bio,
              juryScore: row.juryScore,
              photoFile: row.photoFile,
            }}
            onPatch={(patch) => patchRow(row._key, patch)}
            // The jury hasn't scored at creation — the score is entered later from the edit page.
            showJuryScore={false}
          />
        </div>
      ))}

      {value.length < PAGEANT_CANDIDATES_MAX ? (
        <button type="button" onClick={addRow} className="btn btn-outline self-start">
          Agregar candidatura
        </button>
      ) : (
        <span className="text-xs text-muted">Máximo {PAGEANT_CANDIDATES_MAX} candidaturas.</span>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Quitar candidatura"
        tone="destructive"
        confirmLabel="Quitar"
        cancelLabel="Cancelar"
        onConfirm={() => pendingDelete && removeRow(pendingDelete._key)}
        onCancel={() => setPendingDelete(null)}
      >
        <p>Vas a quitar «{pendingDelete?.name.trim() || "Candidatura sin nombre"}».</p>
      </ConfirmDialog>
    </div>
  );
}
