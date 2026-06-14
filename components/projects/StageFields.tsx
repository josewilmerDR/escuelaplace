/**
 * The text fields of a single project stage (title, justification, cost). Shared by both
 * editors — the create form (StagesEditor) and the edit page's StageCard — so the two can't
 * drift apart again. Fully controlled: the parent owns the values and applies the patch.
 */
import { Field } from "@/components/ui/Field";
import {
  PROJECT_STAGE_COST_MAX,
  PROJECT_STAGE_JUSTIFICATION_MAX,
  PROJECT_STAGE_TITLE_MAX,
  type ProjectCurrency,
} from "@/types";

export function StageFields({
  title,
  justification,
  cost,
  currency,
  onChange,
  required,
}: {
  title: string;
  justification: string;
  cost: number;
  currency: ProjectCurrency;
  onChange: (
    patch: Partial<{ title: string; justification: string; cost: number }>,
  ) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Título de la etapa">
        <input
          type="text"
          required={required}
          maxLength={PROJECT_STAGE_TITLE_MAX}
          value={title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="input"
          placeholder="Ej.: Acondicionar el terreno"
        />
      </Field>
      <Field label="Justificación (por qué existe y qué cubre el costo)">
        <textarea
          rows={3}
          maxLength={PROJECT_STAGE_JUSTIFICATION_MAX}
          value={justification}
          onChange={(e) => onChange({ justification: e.target.value })}
          className="input"
        />
      </Field>
      <Field label={`Costo (${currency})`}>
        <input
          type="number"
          min={0}
          max={PROJECT_STAGE_COST_MAX}
          required={required}
          value={cost || ""}
          onChange={(e) =>
            // Clamp into [0, MAX] so one extra zero can't inflate the goal/progress bar.
            onChange({
              cost: Math.min(
                PROJECT_STAGE_COST_MAX,
                Math.max(0, Number(e.target.value) || 0),
              ),
            })
          }
          className="input"
        />
      </Field>
    </div>
  );
}
