"use client";

/**
 * The guided-tour configuration inputs for the CREATE form (the seam the ToolTypePicker opens,
 * like RaffleConfigFields for a raffle). It collects the ordered stages as TEXT only — each
 * stage's name and a description of what it includes — plus the optional WhatsApp number for
 * the public "Preguntar" button. Per-stage media (photos + a short video) is added later on the
 * edit page, where uploads can persist immediately against a saved stage (mirrors how a project
 * collects stage text on create and its media on the edit page).
 *
 * Controlled: the parent owns a TourFormValue (value + onChange). Validation/conversion to the
 * data-layer TourConfigInput lives here too, so the create page shares it.
 */
import { Field } from "@/components/ui/Field";
import {
  TOUR_STAGE_DESCRIPTION_MAX,
  TOUR_STAGE_MAX,
  TOUR_STAGE_TITLE_MAX,
} from "@/types";
import type { TourConfigInput } from "@/lib/firestore";

/** A tour stage as the create form holds it (text only; media is added on the edit page). */
export interface TourStageDraft {
  title: string;
  description: string;
}

export function emptyTourStage(): TourStageDraft {
  return { title: "", description: "" };
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
 * message when invalid so the page can surface it instead of writing junk. Trailing empty
 * stages (no name and no description) are dropped so an accidental "Agregar etapa" the board
 * never filled doesn't block creation; at least one named stage is required, and every stage
 * that has any content must have a name (the name is what the public sequence is labelled by).
 */
export function toTourInput(
  value: TourFormValue,
): { ok: true; input: TourConfigInput } | { ok: false; error: string } {
  const stages = value.stages
    .map((s) => ({ title: s.title.trim(), description: s.description.trim() }))
    .filter((s) => s.title || s.description);
  if (stages.length === 0) {
    return { ok: false, error: "Agregá al menos una etapa con su nombre." };
  }
  if (stages.some((s) => !s.title)) {
    return { ok: false, error: "Cada etapa necesita un nombre." };
  }
  const contactPhone = value.contactPhone.trim();
  return {
    ok: true,
    input: { stages, ...(contactPhone ? { contactPhone } : {}) },
  };
}

export function TourStagesEditor({
  value,
  onChange,
}: {
  value: TourFormValue;
  onChange: (v: TourFormValue) => void;
}) {
  const updateStage = (i: number, patch: Partial<TourStageDraft>) =>
    onChange({
      ...value,
      stages: value.stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    });
  const removeStage = (i: number) =>
    onChange({ ...value, stages: value.stages.filter((_, idx) => idx !== i) });
  const addStage = () =>
    onChange({ ...value, stages: [...value.stages, emptyTourStage()] });

  return (
    <div className="flex flex-col gap-4">
      {value.stages.map((stage, i) => (
        <fieldset
          key={i}
          className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold tracking-tight text-foreground">
              Etapa {i + 1}
            </legend>
            {value.stages.length > 1 && (
              <button
                type="button"
                onClick={() => removeStage(i)}
                className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
              >
                Quitar
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Nombre de la etapa">
              <input
                type="text"
                maxLength={TOUR_STAGE_TITLE_MAX}
                value={stage.title}
                onChange={(e) => updateStage(i, { title: e.target.value })}
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
                  updateStage(i, { description: e.target.value })
                }
                className="input"
                placeholder="Contá qué se ve y se hace en esta etapa."
              />
            </Field>
          </div>
        </fieldset>
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
        dejás en blanco, usa el teléfono de la junta de la escuela. Las fotos y el
        video de cada etapa se agregan al editar la herramienta.
      </p>
    </div>
  );
}
