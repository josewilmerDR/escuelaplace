"use client";

/**
 * The guided-tour configuration inputs for the CREATE form (the seam the ToolTypePicker opens,
 * like RaffleConfigFields for a raffle). It collects the ordered stages — each stage's name, a
 * description of what it includes AND its media (photos + a short video) — plus the optional
 * WhatsApp number for the public "Preguntar" button. Media uploads immediately to the tool's
 * Storage path (the create page pre-allocates the tool id) and the URLs ride along in the single
 * `createTool` write, so the whole tour is filled here. The per-stage card is the shared
 * <ToolItemCard>, the same media block the edit page uses.
 *
 * Controlled: the parent owns a TourFormValue (value + onChange). Validation/conversion to the
 * data-layer TourConfigInput lives here too. Each stage carries a local-only `id` (minted on add,
 * in an event handler — never during render — so it's SSR-safe) used only to key React and match
 * media; it is STRIPPED on conversion, since stored stages are positional (no per-stage id).
 */
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { Field } from "@/components/ui/Field";
import {
  TOUR_STAGE_DESCRIPTION_MAX,
  TOUR_STAGE_MAX,
  TOUR_STAGE_PHOTO_MAX,
  TOUR_STAGE_TITLE_MAX,
} from "@/types";
import type { TourConfigInput } from "@/lib/firestore";

/** A tour stage as the create form holds it: text + media URLs + a local-only id. */
export interface TourStageDraft {
  /** Local-only id (minted on add); keys React + matches media. Stripped on conversion. */
  id: string;
  title: string;
  description: string;
  /** Photos already uploaded to Storage (URLs). */
  photos?: string[];
  /** A short video already uploaded to Storage (URL). */
  videoUrl?: string;
}

/** A stable local id for a stage, generated in an event handler (SSR-safe). */
export function newTourStageId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyTourStage(): TourStageDraft {
  return { id: newTourStageId(), title: "", description: "" };
}

/** The full create-form value: the ordered stages plus the optional WhatsApp contact. */
export interface TourFormValue {
  stages: TourStageDraft[];
  contactPhone: string;
}

export function emptyTourForm(): TourFormValue {
  return { stages: [emptyTourStage()], contactPhone: "" };
}

/**
 * Validate + convert the create form to a data-layer TourConfigInput. Returns a Spanish error
 * message when invalid so the page can surface it instead of writing junk. Trailing empty stages
 * (no name, description OR media) are dropped so an accidental "Agregar etapa" the board never
 * filled doesn't block creation; at least one named stage is required, and every stage that has
 * any content must have a name (the name labels the public sequence). The local id is dropped —
 * stored stages are positional.
 */
export function toTourInput(
  value: TourFormValue,
): { ok: true; input: TourConfigInput } | { ok: false; error: string } {
  const stages = value.stages
    .map((s) => ({
      title: s.title.trim(),
      description: s.description.trim(),
      photos: s.photos,
      videoUrl: s.videoUrl,
    }))
    .filter(
      (s) =>
        s.title ||
        s.description ||
        (s.photos?.length ?? 0) > 0 ||
        Boolean(s.videoUrl),
    );
  if (stages.length === 0) {
    return { ok: false, error: "Agregá al menos una etapa con su nombre." };
  }
  if (stages.some((s) => !s.title)) {
    return { ok: false, error: "Cada etapa necesita un nombre." };
  }
  const contactPhone = value.contactPhone.trim();
  return {
    ok: true,
    input: {
      stages: stages.map((s) => ({
        title: s.title,
        description: s.description,
        ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
        ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
      })),
      ...(contactPhone ? { contactPhone } : {}),
    },
  };
}

export function TourStagesEditor({
  value,
  onChange,
  schoolId,
  toolId,
}: {
  value: TourFormValue;
  onChange: (v: TourFormValue) => void;
  /** School id + the create page's pre-allocated tool id — the per-stage media upload path. */
  schoolId: string;
  toolId: string;
}) {
  const updateStage = (id: string, patch: Partial<TourStageDraft>) =>
    onChange({
      ...value,
      stages: value.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const removeStage = (id: string) =>
    onChange({ ...value, stages: value.stages.filter((s) => s.id !== id) });
  const addStage = () =>
    onChange({ ...value, stages: [...value.stages, emptyTourStage()] });

  return (
    <div className="flex flex-col gap-4">
      {value.stages.map((stage, i) => (
        <ToolItemCard
          key={stage.id}
          title={`Etapa ${i + 1}`}
          removeLabel="Quitar etapa"
          canRemove={value.stages.length > 1}
          onRemove={() => removeStage(stage.id)}
          photos={stage.photos ?? []}
          videoUrl={stage.videoUrl}
          photoMax={TOUR_STAGE_PHOTO_MAX}
          schoolId={schoolId}
          toolId={toolId}
          persisted
          unsavedHint=""
          onMedia={async (media) =>
            updateStage(stage.id, {
              ...(media.photos !== undefined ? { photos: media.photos } : {}),
              ...(media.videoUrl !== undefined
                ? { videoUrl: media.videoUrl ?? undefined }
                : {}),
            })
          }
        >
          <Field label="Nombre de la etapa">
            <input
              type="text"
              maxLength={TOUR_STAGE_TITLE_MAX}
              value={stage.title}
              onChange={(e) => updateStage(stage.id, { title: e.target.value })}
              className="input"
              placeholder="Ej.: Breve historia de la escuela"
            />
          </Field>
          <Field label="¿Qué incluye?">
            <textarea
              rows={3}
              maxLength={TOUR_STAGE_DESCRIPTION_MAX}
              value={stage.description}
              onChange={(e) =>
                updateStage(stage.id, { description: e.target.value })
              }
              className="input"
              placeholder="Contá qué se ve y se hace en esta etapa."
            />
          </Field>
        </ToolItemCard>
      ))}

      {value.stages.length < TOUR_STAGE_MAX ? (
        <button type="button" onClick={addStage} className="btn btn-outline self-start">
          Agregar etapa
        </button>
      ) : (
        <span className="text-xs text-muted">Máximo {TOUR_STAGE_MAX} etapas.</span>
      )}

      <Field label="WhatsApp para consultas (opcional)">
        <input
          type="tel"
          inputMode="tel"
          value={value.contactPhone}
          onChange={(e) => onChange({ ...value, contactPhone: e.target.value })}
          className="input"
          placeholder="Ej.: 8888 8888"
        />
      </Field>
      <p className="-mt-2 text-xs text-muted">
        El botón “Preguntar” de la página abrirá WhatsApp con este número. Si lo
        dejás en blanco, usa el teléfono de la junta de la escuela.
      </p>
    </div>
  );
}
