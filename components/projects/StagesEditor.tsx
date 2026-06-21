"use client";

/**
 * Editor for a project's stages on the CREATE form: each stage's text (title, justification,
 * cost) AND its media (photos + a short video), mirroring the guided-tour stage editor. Media
 * uploads immediately to the project's Storage path — the create page pre-allocates the project
 * id (newProjectId) so uploads land before the doc exists — and the URLs ride along in the single
 * `createProject` write. The per-stage card is the shared <ToolItemCard> (the same media block the
 * tools use), with the project's <StageFields> as its text children.
 *
 * Controlled with a FUNCTIONAL setter (the page passes setStages directly): every mutation
 * computes from the LATEST state, so an async per-stage media upload that resolves after the board
 * edited text (or after another stage's upload) merges its delta instead of reverting to the stale
 * snapshot captured when the upload began. Each stage carries a local-only `id` (minted on add, in
 * an event handler or the lazy initial state — SSR-safe, never rendered to the DOM) used only to
 * key React and match async media; it is STRIPPED on create, since stored stages are positional.
 */
import type { Dispatch, SetStateAction } from "react";
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { StageFields } from "@/components/projects/StageFields";
import { formatMoney } from "@/lib/format";
import { uploadProjectAsset } from "@/lib/firestore";
import {
  PROJECT_STAGE_MAX,
  PROJECT_STAGE_PHOTO_MAX,
  type ProjectCurrency,
} from "@/types";

export interface StageDraft {
  /** Local-only id (minted on add); keys React + matches async media. Stripped on create. */
  id: string;
  title: string;
  justification: string;
  cost: number;
  /** Photos already uploaded to Storage (URLs). */
  photos?: string[];
  /** A short video already uploaded to Storage (URL). */
  videoUrl?: string;
}

/** A stable local id for a stage, generated in an event handler / lazy state (SSR-safe). */
export function newStageId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyStage(): StageDraft {
  return { id: newStageId(), title: "", justification: "", cost: 0 };
}

export function StagesEditor({
  stages,
  onChange,
  currency,
  schoolId,
  projectId,
}: {
  stages: StageDraft[];
  // Functional setter so an async media upload that resolves after a text edit merges its delta
  // instead of clobbering the form with a stale snapshot (see the module docstring).
  onChange: Dispatch<SetStateAction<StageDraft[]>>;
  currency: ProjectCurrency;
  /** School id + the create page's pre-allocated project id — the per-stage media upload path. */
  schoolId: string;
  projectId: string;
}) {
  const total = stages.reduce((sum, s) => sum + (s.cost || 0), 0);

  const update = (id: string, patch: Partial<StageDraft>) =>
    onChange((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) =>
    onChange((prev) => prev.filter((s) => s.id !== id));
  const add = () => onChange((prev) => [...prev, emptyStage()]);

  return (
    <div className="flex flex-col gap-4">
      {stages.map((stage, i) => (
        <ToolItemCard
          key={stage.id}
          title={`Etapa ${i + 1}`}
          removeLabel="Quitar"
          canRemove={stages.length > 1}
          onRemove={() => remove(stage.id)}
          photos={stage.photos ?? []}
          videoUrl={stage.videoUrl}
          photoMax={PROJECT_STAGE_PHOTO_MAX}
          // The project id is pre-allocated, so the path is writable from the first upload — no
          // unsaved gate (unlike the edit page, where a brand-new stage has no slot yet).
          persisted
          unsavedHint=""
          uploadAsset={(kind, file) =>
            uploadProjectAsset(schoolId, projectId, kind, file)
          }
          onMedia={async (media) =>
            update(stage.id, {
              ...(media.photos !== undefined ? { photos: media.photos } : {}),
              ...(media.videoUrl !== undefined
                ? { videoUrl: media.videoUrl ?? undefined }
                : {}),
            })
          }
        >
          <StageFields
            title={stage.title}
            justification={stage.justification}
            cost={stage.cost}
            currency={currency}
            onChange={(patch) => update(stage.id, patch)}
            required
          />
        </ToolItemCard>
      ))}

      <div className="flex items-center justify-between gap-3">
        {stages.length < PROJECT_STAGE_MAX ? (
          <button type="button" onClick={add} className="btn btn-outline">
            Agregar etapa
          </button>
        ) : (
          <span className="text-xs text-muted">
            Máximo {PROJECT_STAGE_MAX} etapas.
          </span>
        )}
        {/* Running total = the project goal it's building as the board types. */}
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Meta total: {formatMoney(total, currency)}
        </span>
      </div>
    </div>
  );
}
