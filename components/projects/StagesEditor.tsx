"use client";

/**
 * Editor for a project's stages (text fields only: title, justification, cost). Media per
 * stage (photos, quotes) is managed separately on the edit page, since uploads must
 * persist immediately. Controlled — the parent owns the array. Shows the running total so
 * the board sees the goal it's building as it types.
 */
import { Field } from "@/components/ui/Field";
import { formatMoney } from "@/lib/format";
import {
  PROJECT_STAGE_JUSTIFICATION_MAX,
  PROJECT_STAGE_MAX,
  PROJECT_STAGE_TITLE_MAX,
  type ProjectCurrency,
} from "@/types";

export interface StageDraft {
  title: string;
  justification: string;
  cost: number;
}

export function emptyStage(): StageDraft {
  return { title: "", justification: "", cost: 0 };
}

export function StagesEditor({
  stages,
  onChange,
  currency,
}: {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
  currency: ProjectCurrency;
}) {
  const total = stages.reduce((sum, s) => sum + (s.cost || 0), 0);

  const update = (i: number, patch: Partial<StageDraft>) => {
    onChange(stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const remove = (i: number) => onChange(stages.filter((_, idx) => idx !== i));
  const add = () => onChange([...stages, emptyStage()]);

  return (
    <div className="flex flex-col gap-4">
      {stages.map((stage, i) => (
        <fieldset
          key={i}
          className="rounded-lg border border-border p-3"
        >
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium">Etapa {i + 1}</legend>
            {stages.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-muted underline hover:text-red-600"
              >
                Quitar
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-col gap-3">
            <Field label="Título de la etapa">
              <input
                type="text"
                required
                maxLength={PROJECT_STAGE_TITLE_MAX}
                value={stage.title}
                onChange={(e) => update(i, { title: e.target.value })}
                className="input"
                placeholder="Ej.: Acondicionar el terreno"
              />
            </Field>
            <Field label="Justificación (por qué existe y qué cubre el costo)">
              <textarea
                rows={3}
                maxLength={PROJECT_STAGE_JUSTIFICATION_MAX}
                value={stage.justification}
                onChange={(e) => update(i, { justification: e.target.value })}
                className="input"
              />
            </Field>
            <Field label={`Costo (${currency})`}>
              <input
                type="number"
                min={0}
                required
                value={stage.cost || ""}
                onChange={(e) =>
                  update(i, { cost: Math.max(0, Number(e.target.value) || 0) })
                }
                className="input"
              />
            </Field>
          </div>
        </fieldset>
      ))}

      <div className="flex items-center justify-between">
        {stages.length < PROJECT_STAGE_MAX ? (
          <button type="button" onClick={add} className="btn btn-outline">
            Agregar etapa
          </button>
        ) : (
          <span className="text-xs text-muted">
            Máximo {PROJECT_STAGE_MAX} etapas.
          </span>
        )}
        <span className="text-sm font-medium">
          Meta total: {formatMoney(total, currency)}
        </span>
      </div>
    </div>
  );
}
