"use client";

/**
 * Roster editor for a reinado ("Reinado"), shown on the tool's edit page. Manages the candidate
 * subcollection (schools/{id}/tools/{toolId}/candidates) directly: each candidate is its OWN doc, so
 * the editor self-loads the roster and writes each add/edit/delete immediately — independent of the
 * tool form's save button (the same way the bingo lote is managed apart from the bingo config).
 *
 * The four tally fields (voteFree/voteSupport/supportCount/padrinoCount) are Cloud-Function-
 * maintained and never written here; the school owns name/bio/photo and the human `juryScore` (which
 * feeds the crown formula). A candidate photo uploads to the tool's asset path on save. PURELY
 * INFORMATIONAL — the platform never processes money.
 */
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { userErrorMessage } from "@/lib/errors";
import {
  createCandidate,
  deleteCandidate,
  getCandidates,
  updateCandidate,
  uploadToolStageAsset,
} from "@/lib/firestore";
import {
  PAGEANT_CANDIDATES_MAX,
  PAGEANT_CANDIDATE_BIO_MAX,
  PAGEANT_CANDIDATE_NAME_MAX,
  PAGEANT_JURY_SCORE_MAX,
  type CandidateDoc,
} from "@/types";

type LoadState = "loading" | "error" | "loaded";

/** A candidate being edited: the saved doc id once persisted, a stable local `_key` for React, the
 * string-shaped jury score, an optional freshly-picked photo file, and per-row save/dirty flags. */
interface EditableCandidate {
  _key: number;
  /** Set once the candidate is saved; absent for a brand-new unsaved row. */
  id?: string;
  name: string;
  bio: string;
  juryScore: string;
  order: number;
  /** The saved photo URL (if any). */
  photoUrl?: string;
  /** A newly picked photo, not yet uploaded — overrides photoUrl on save. */
  photoFile: File | null;
  saving: boolean;
  dirty: boolean;
}

function toEditable(c: CandidateDoc, key: number): EditableCandidate {
  return {
    _key: key,
    id: c.id,
    name: c.name,
    bio: c.bio,
    juryScore: String(c.juryScore ?? 0),
    order: c.order,
    photoUrl: c.photoUrl,
    photoFile: null,
    saving: false,
    dirty: false,
  };
}

/** Clamp the jury-score input to the integer 0..100 the rules require (blank/garbage → 0). */
function clampScore(value: string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(PAGEANT_JURY_SCORE_MAX, Math.max(0, n));
}

export function PageantCandidatesEditor({
  schoolId,
  toolId,
}: {
  schoolId: string;
  toolId: string;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<EditableCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EditableCandidate | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Deterministic monotonic counter for stable React keys (no Math.random/Date.now).
  const nextKey = useRef(0);

  // No synchronous setState in the body (it would cascade renders on mount) — loadState starts
  // 'loading' and only the async resolution flips it. The retry button re-arms 'loading' itself.
  const load = useCallback(() => {
    getCandidates(schoolId, toolId)
      .then((cands) => {
        setRows(cands.map((c) => toEditable(c, nextKey.current++)));
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [schoolId, toolId]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  const patchRow = (key: number, patch: Partial<EditableCandidate>) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const addRow = () => {
    const order = rows.reduce((max, r) => Math.max(max, r.order), -1) + 1;
    setRows((prev) => [
      ...prev,
      {
        _key: nextKey.current++,
        name: "",
        bio: "",
        juryScore: "0",
        order,
        photoFile: null,
        saving: false,
        dirty: true,
      },
    ]);
  };

  const saveRow = async (row: EditableCandidate) => {
    const name = row.name.trim();
    if (!name) {
      setError("Cada candidatura necesita un nombre.");
      return;
    }
    setError(null);
    patchRow(row._key, { saving: true });
    try {
      // Upload a freshly picked photo first (to the tool's asset path); keep the existing URL otherwise.
      let photoUrl = row.photoUrl;
      if (row.photoFile) {
        photoUrl = await uploadToolStageAsset(schoolId, toolId, "photo", row.photoFile);
      }
      const bio = row.bio.trim();
      const juryScore = clampScore(row.juryScore);
      if (row.id) {
        await updateCandidate(schoolId, toolId, row.id, {
          name,
          bio,
          juryScore,
          order: row.order,
          // Only write the photo when a new one was uploaded (keep the existing one otherwise).
          ...(row.photoFile ? { photoUrl } : {}),
        });
        patchRow(row._key, {
          name,
          bio,
          juryScore: String(juryScore),
          photoUrl,
          photoFile: null,
          saving: false,
          dirty: false,
        });
      } else {
        const id = await createCandidate(schoolId, toolId, {
          name,
          bio,
          order: row.order,
          juryScore,
          ...(photoUrl ? { photoUrl } : {}),
        });
        patchRow(row._key, {
          id,
          name,
          bio,
          juryScore: String(juryScore),
          photoUrl,
          photoFile: null,
          saving: false,
          dirty: false,
        });
      }
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo guardar la candidatura."));
      patchRow(row._key, { saving: false });
    }
  };

  const removeRow = async (row: EditableCandidate) => {
    // An unsaved row has no doc — just drop it locally.
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r._key !== row._key));
      setPendingDelete(null);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteCandidate(schoolId, toolId, row.id);
      setRows((prev) => prev.filter((r) => r._key !== row._key));
      setPendingDelete(null);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar la candidatura."));
    } finally {
      setDeleting(false);
    }
  };

  /** "Quitar": a saved candidate is confirmed first; an unsaved one is dropped immediately. */
  const onRemoveClick = (row: EditableCandidate) => {
    if (row.id) setPendingDelete(row);
    else removeRow(row);
  };

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
          Aún no has agregado candidaturas. Agrega la primera con el botón de abajo.
        </p>
      )}

      {rows.map((row, i) => (
        <CandidateCard
          key={row._key}
          row={row}
          index={i}
          onPatch={(patch) => patchRow(row._key, { ...patch, dirty: true })}
          onSave={() => saveRow(row)}
          onRemove={() => onRemoveClick(row)}
        />
      ))}

      <FormError message={error} />

      {rows.length < PAGEANT_CANDIDATES_MAX ? (
        <button type="button" onClick={addRow} className="btn btn-outline self-start">
          Agregar candidatura
        </button>
      ) : (
        <span className="text-xs text-muted">
          Máximo {PAGEANT_CANDIDATES_MAX} candidaturas.
        </span>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Quitar candidatura"
        tone="destructive"
        confirmLabel="Quitar"
        cancelLabel="Cancelar"
        busy={deleting}
        busyLabel="Quitando…"
        onConfirm={() => pendingDelete && removeRow(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          Vas a quitar «{pendingDelete?.name.trim() || "Candidatura sin nombre"}». No se puede
          deshacer.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** One candidate's editable card: photo, name, bio, jury score, plus per-row save/remove. */
function CandidateCard({
  row,
  index,
  onPatch,
  onSave,
  onRemove,
}: {
  row: EditableCandidate;
  index: number;
  onPatch: (patch: Partial<EditableCandidate>) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl bg-background p-4 ring-1 ring-black/5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          Candidatura {index + 1}
        </p>
        <button
          type="button"
          onClick={onRemove}
          disabled={row.saving}
          className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error disabled:opacity-50"
        >
          Quitar
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Current photo preview (the picker only previews a NEW file). */}
        {row.photoUrl && !row.photoFile && (
          <span className="relative block h-20 w-20 overflow-hidden rounded-full bg-surface ring-1 ring-black/5">
            <Image src={row.photoUrl} alt="" fill sizes="80px" className="object-cover" />
          </span>
        )}
        <ImagePicker
          label={row.photoUrl ? "Reemplazar foto" : "Foto (opcional)"}
          variant="avatar"
          value={row.photoFile}
          onChange={(f) => onPatch({ photoFile: f })}
        />

        <Field label="Nombre">
          <input
            type="text"
            maxLength={PAGEANT_CANDIDATE_NAME_MAX}
            value={row.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            className="input"
            placeholder="Ej.: María Fernández, 6.º grado"
          />
        </Field>

        <Field label="Presentación (opcional)">
          <textarea
            rows={3}
            maxLength={PAGEANT_CANDIDATE_BIO_MAX}
            value={row.bio}
            onChange={(e) => onPatch({ bio: e.target.value })}
            className="input"
            placeholder="Por qué se postula, qué representa, su talento…"
          />
        </Field>

        <Field label="Puntaje del jurado (0–100)">
          <input
            type="number"
            min={0}
            max={PAGEANT_JURY_SCORE_MAX}
            step={1}
            inputMode="numeric"
            value={row.juryScore}
            onChange={(e) => onPatch({ juryScore: e.target.value })}
            className="input"
          />
        </Field>
        <p className="-mt-2 text-xs text-muted">
          Alimenta la fórmula de la corona. Puedes ajustarlo cuando el jurado decida.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={row.saving || (!row.dirty && Boolean(row.id))}
            className="btn btn-primary"
          >
            {row.saving ? "Guardando…" : row.id ? "Guardar candidatura" : "Agregar candidatura"}
          </button>
          {!row.id && (
            <span className="text-xs text-muted">Sin guardar todavía.</span>
          )}
        </div>
      </div>
    </div>
  );
}
