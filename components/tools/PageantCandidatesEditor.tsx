"use client";

/**
 * Roster editor for a reinado ("Reinado"), shown on the tool's edit page. It self-loads the candidate
 * subcollection (schools/{id}/tools/{toolId}/candidates) and holds the roster as local drafts, but it
 * NO LONGER saves each candidate on its own — the whole roster is persisted with the tool form's
 * "Guardar cambios" button. The parent drives it through the imperative handle (validate + saveAll) on
 * submit, and edits notify the parent (onDirty) so the form's unsaved-changes guard and save flow
 * include the roster. Adds/edits/removes are staged in memory and only written on save (creates,
 * updates, and the deletions queued by "Quitar").
 *
 * The four tally fields (voteFree/voteSupport/supportCount/padrinoCount) are Cloud-Function-maintained
 * and never written here; the school owns name/bio/photo and the human juryScore. A candidate photo
 * uploads to the tool's asset path on save. PURELY INFORMATIONAL — the platform never processes money.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { CandidateFields, clampScore } from "@/components/tools/CandidateFields";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrashIcon } from "@/components/ui/icons";
import {
  createCandidate,
  deleteCandidate,
  getCandidates,
  updateCandidate,
  uploadToolStageAsset,
} from "@/lib/firestore";
import { PAGEANT_CANDIDATES_MAX, type CandidateDoc } from "@/types";

type LoadState = "loading" | "error" | "loaded";

/** A candidate being edited: its saved doc id once persisted (absent for a new row), a stable local
 * `_key`, the string-shaped jury score, the saved order, an optional freshly-picked photo, and a dirty
 * flag so an unchanged existing row is skipped on save. */
interface CandidateRow {
  _key: number;
  id?: string;
  name: string;
  bio: string;
  juryScore: string;
  order: number;
  photoUrl?: string;
  photoFile: File | null;
  dirty: boolean;
}

/** Imperative handle the tool's edit page drives from "Guardar cambios". */
export interface PageantCandidatesHandle {
  /** A Spanish error if the roster is invalid (a content-bearing candidate needs a name), else null.
   * Call BEFORE the tool write so an invalid roster never leaves a half-saved tool. */
  validate: () => string | null;
  /** Persist every staged change (deletes, then creates/updates with order = position). Throws on
   * failure so the caller's save catch surfaces it; reflects each saved row as it goes, so a retry
   * after a mid-batch failure never duplicates a create. */
  saveAll: () => Promise<void>;
}

function toRow(c: CandidateDoc, key: number): CandidateRow {
  return {
    _key: key,
    id: c.id,
    name: c.name,
    bio: c.bio,
    juryScore: String(c.juryScore ?? 0),
    order: c.order,
    photoUrl: c.photoUrl,
    photoFile: null,
    dirty: false,
  };
}

/** A content-bearing row (worth persisting); an untouched blank new row is dropped on save. */
function hasContent(r: CandidateRow): boolean {
  return Boolean(r.id) || r.name.trim() !== "" || r.bio.trim() !== "" || r.photoFile !== null;
}

export const PageantCandidatesEditor = forwardRef<
  PageantCandidatesHandle,
  {
    schoolId: string;
    toolId: string;
    onDirty?: () => void;
    /** Hide the jury score input (the jury hasn't scored yet at creation). Default: shown. */
    showJuryScore?: boolean;
  }
>(function PageantCandidatesEditor(
  { schoolId, toolId, onDirty, showJuryScore = true },
  ref,
) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<CandidateRow[]>([]);
  // Saved candidates removed in the UI but not yet deleted in Firestore — flushed on save.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [pendingRemove, setPendingRemove] = useState<CandidateRow | null>(null);
  // Deterministic monotonic counter for stable React keys (no Math.random/Date.now).
  const nextKey = useRef(0);

  const load = useCallback(() => {
    getCandidates(schoolId, toolId)
      .then((cands) => {
        setRows(cands.map((c) => toRow(c, nextKey.current++)));
        setPendingDeleteIds([]);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [schoolId, toolId]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  const patchRow = (key: number, patch: Partial<CandidateRow>) => {
    setRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, ...patch, dirty: true } : r)),
    );
    onDirty?.();
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        _key: nextKey.current++,
        name: "",
        bio: "",
        juryScore: "0",
        order: prev.reduce((max, r) => Math.max(max, r.order), -1) + 1,
        photoFile: null,
        dirty: true,
      },
    ]);
    onDirty?.();
  };

  /** Drop a row from the UI; a saved one also queues its id for deletion on the next save. */
  const stageRemove = (row: CandidateRow) => {
    const id = row.id;
    if (id) setPendingDeleteIds((prev) => [...prev, id]);
    setRows((prev) => prev.filter((r) => r._key !== row._key));
    setPendingRemove(null);
    onDirty?.();
  };

  /** "Quitar": a content-bearing row is confirmed first; an empty new row is dropped immediately. */
  const onRemoveClick = (row: CandidateRow) => {
    if (hasContent(row)) setPendingRemove(row);
    else stageRemove(row);
  };

  useImperativeHandle(
    ref,
    () => ({
      validate() {
        if (loadState !== "loaded") return null;
        if (rows.filter(hasContent).some((r) => !r.name.trim())) {
          return "Cada candidatura necesita un nombre.";
        }
        return null;
      },
      async saveAll() {
        // Never touch the roster if it didn't load — avoids deleting candidates we never saw.
        if (loadState !== "loaded") return;
        // Deletions first; clear each from the queue as it lands so a retry doesn't redo them.
        for (const delId of pendingDeleteIds) {
          await deleteCandidate(schoolId, toolId, delId);
          setPendingDeleteIds((prev) => prev.filter((x) => x !== delId));
        }
        // Creates + updates, order = position. Work on a copy, dropping empty new rows, and reflect
        // each saved row immediately so a mid-batch failure leaves created rows with their new id (no
        // duplicate on a retry). An unchanged existing row whose position didn't shift is skipped.
        let working = rows.filter(hasContent);
        setRows(working);
        for (let i = 0; i < working.length; i++) {
          const row = working[i];
          const needsWrite =
            !row.id || row.dirty || row.order !== i || row.photoFile !== null;
          if (!needsWrite) continue;
          const name = row.name.trim();
          const bio = row.bio.trim();
          const juryScore = clampScore(row.juryScore);
          let photoUrl = row.photoUrl;
          if (row.photoFile) {
            photoUrl = await uploadToolStageAsset(schoolId, toolId, "photo", row.photoFile);
          }
          let savedId = row.id;
          if (savedId) {
            await updateCandidate(schoolId, toolId, savedId, {
              name,
              bio,
              juryScore,
              order: i,
              // Only write the photo when a new one was uploaded (keep the existing one otherwise).
              ...(row.photoFile ? { photoUrl } : {}),
            });
          } else {
            savedId = await createCandidate(schoolId, toolId, {
              name,
              bio,
              order: i,
              juryScore,
              ...(photoUrl ? { photoUrl } : {}),
            });
          }
          working = working.map((r, j) =>
            j === i
              ? {
                  ...r,
                  id: savedId,
                  name,
                  bio,
                  juryScore: String(juryScore),
                  order: i,
                  photoUrl,
                  photoFile: null,
                  dirty: false,
                }
              : r,
          );
          setRows(working);
        }
      },
    }),
    [loadState, rows, pendingDeleteIds, schoolId, toolId],
  );

  if (loadState === "loading") {
    return (
      <div
        className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
        aria-hidden="true"
      />
    );
  }

  if (loadState === "error") {
    return (
      <div>
        <p role="alert" className="text-sm text-error">
          No pudimos cargar las candidaturas. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 && (
        <p className="text-sm text-muted">
          Aún no has agregado candidaturas. Agrega la primera con el botón de abajo; se guardan con
          «Guardar cambios».
        </p>
      )}

      {rows.map((row, i) => (
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
              photoUrl: row.photoUrl,
              photoFile: row.photoFile,
            }}
            onPatch={(patch) => patchRow(row._key, patch)}
            showJuryScore={showJuryScore}
          />
        </div>
      ))}

      {rows.length < PAGEANT_CANDIDATES_MAX ? (
        <button type="button" onClick={addRow} className="btn btn-outline self-start">
          Agregar candidatura
        </button>
      ) : (
        <span className="text-xs text-muted">Máximo {PAGEANT_CANDIDATES_MAX} candidaturas.</span>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Quitar candidatura"
        tone="destructive"
        confirmLabel="Quitar"
        cancelLabel="Cancelar"
        onConfirm={() => pendingRemove && stageRemove(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      >
        <p>
          Vas a quitar «{pendingRemove?.name.trim() || "Candidatura sin nombre"}». Se aplicará al
          guardar los cambios.
        </p>
      </ConfirmDialog>
    </div>
  );
});
