"use client";

/**
 * Editor for a project's stages (text fields only: title, justification, cost). Media per
 * stage (photos, quotes) is managed separately on the edit page, since uploads must
 * persist immediately. Controlled — the parent owns the array. Shows the running total so
 * the board sees the goal it's building as it types.
 */
import { StageFields } from "@/components/projects/StageFields";
import { formatMoney } from "@/lib/format";
import { PROJECT_STAGE_MAX, type ProjectCurrency } from "@/types";

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
        // Each stage is an elevated calm-depth card (ring + soft shadow, no hard border).
        <fieldset
          key={i}
          className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold tracking-tight text-foreground">
              Etapa {i + 1}
            </legend>
            {stages.length > 1 && (
              // Removal is immediate here (no ConfirmDialog) unlike the project edit page:
              // a draft stage isn't persisted yet and has no media or index-linked
              // contributions, so confirming would be needless friction. The edit page
              // confirms because there a stage carries uploaded media and contributions
              // reference stages by position (see projects/[pid]/page.tsx).
              <button
                type="button"
                onClick={() => remove(i)}
                className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
              >
                Quitar
              </button>
            )}
          </div>
          <div className="mt-3">
            <StageFields
              title={stage.title}
              justification={stage.justification}
              cost={stage.cost}
              currency={currency}
              onChange={(patch) => update(i, patch)}
              required
            />
          </div>
        </fieldset>
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
