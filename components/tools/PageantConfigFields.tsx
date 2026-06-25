"use client";

/**
 * The pageant-specific configuration inputs ("Reinado"), shared by the create and edit forms (like
 * EventConfigFields). Controlled — the parent owns a PageantFormValue. Conversion to/from the stored
 * PageantConfig lives here. The candidate ROSTER is NOT configured here; it's a subcollection managed
 * separately (a later slice). PURELY INFORMATIONAL — the platform never processes money; the price
 * per support unit only labels the relationship the supporter records, never a charge.
 */
import { Field } from "@/components/ui/Field";
import { toolDateFromInput, toolDateInputValue } from "@/lib/firestore";
import {
  PAGEANT_CAUSE_MAX,
  PAGEANT_CRITERIA_MAX,
  PAGEANT_DEFAULT_CROWN_FORMULA,
  PROJECT_CURRENCIES,
  type PageantConfig,
  type ProjectCurrency,
} from "@/types";
import type { PageantConfigInput } from "@/lib/firestore";

/** Form-shaped pageant config (all strings/boolean, as the inputs hold them). */
export interface PageantFormValue {
  criteria: string;
  cause: string;
  /** Voting window, "YYYY-MM-DD". */
  opensAt: string;
  closesAt: string;
  pricePerSupportUnit: string;
  currency: ProjectCurrency;
  freeVotingEnabled: boolean;
  /** Crown weights as strings (must be integers 0..100 summing to 100). */
  jury: string;
  support: string;
  sympathy: string;
}

export function emptyPageantForm(): PageantFormValue {
  return {
    criteria: "",
    cause: "",
    opensAt: "",
    closesAt: "",
    pricePerSupportUnit: "",
    currency: "CRC",
    // Off until App Check is proven in prod — a non-tamper-proof count must never weigh on a crown.
    freeVotingEnabled: false,
    jury: String(PAGEANT_DEFAULT_CROWN_FORMULA.jury),
    support: String(PAGEANT_DEFAULT_CROWN_FORMULA.support),
    sympathy: String(PAGEANT_DEFAULT_CROWN_FORMULA.sympathy),
  };
}

/** Hydrate the form from a stored config (edit page). */
export function pageantFormFromConfig(config: PageantConfig): PageantFormValue {
  return {
    criteria: config.criteria ?? "",
    cause: config.cause ?? "",
    opensAt: toolDateInputValue(config.opensAt),
    closesAt: toolDateInputValue(config.closesAt),
    pricePerSupportUnit: String(config.pricePerSupportUnit),
    currency: config.currency,
    freeVotingEnabled: config.freeVotingEnabled,
    jury: String(config.crownFormula.jury),
    support: String(config.crownFormula.support),
    sympathy: String(config.crownFormula.sympathy),
  };
}

/**
 * Validate + convert the form to a data-layer PageantConfigInput. Returns a Spanish error when
 * invalid: the support unit value must be > 0, the three crown weights must be integers 0..100 that
 * sum to 100, and the close date (when both are set) can't precede the open date.
 */
export function toPageantInput(
  value: PageantFormValue,
): { ok: true; input: PageantConfigInput } | { ok: false; error: string } {
  const price = Number(value.pricePerSupportUnit);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Ingresa un valor por unidad de apoyo mayor a 0." };
  }
  const jury = Number(value.jury);
  const support = Number(value.support);
  const sympathy = Number(value.sympathy);
  if ([jury, support, sympathy].some((w) => !Number.isInteger(w) || w < 0 || w > 100)) {
    return { ok: false, error: "Cada peso de la corona debe ser un entero entre 0 y 100." };
  }
  if (jury + support + sympathy !== 100) {
    return {
      ok: false,
      error: "Los pesos de la corona (jurado, apoyo y simpatía) deben sumar 100.",
    };
  }
  const opensAt = toolDateFromInput(value.opensAt);
  const closesAt = toolDateFromInput(value.closesAt);
  if (opensAt && closesAt && closesAt < opensAt) {
    return { ok: false, error: "La fecha de cierre no puede ser anterior a la de apertura." };
  }
  const criteria = value.criteria.trim();
  const cause = value.cause.trim();
  return {
    ok: true,
    input: {
      currency: value.currency,
      pricePerSupportUnit: price,
      freeVotingEnabled: value.freeVotingEnabled,
      crownFormula: { jury, support, sympathy },
      ...(criteria ? { criteria } : {}),
      ...(cause ? { cause } : {}),
      ...(opensAt ? { opensAt } : {}),
      ...(closesAt ? { closesAt } : {}),
    },
  };
}

export function PageantConfigFields({
  value,
  onChange,
}: {
  value: PageantFormValue;
  onChange: (v: PageantFormValue) => void;
}) {
  const set = (patch: Partial<PageantFormValue>) => onChange({ ...value, ...patch });
  // Live sum so the board sees whether the crown weights add to 100 before saving.
  const weightSum =
    (Number(value.jury) || 0) + (Number(value.support) || 0) + (Number(value.sympathy) || 0);

  return (
    <div className="flex flex-col gap-4">
      <Field label="Criterios del reinado (opcional)">
        <textarea
          rows={3}
          maxLength={PAGEANT_CRITERIA_MAX}
          value={value.criteria}
          onChange={(e) => set({ criteria: e.target.value })}
          className="input"
          placeholder="Ej.: liderazgo, talento, representación de los valores de la comunidad."
        />
      </Field>

      <Field label="¿Para qué son los fondos? (opcional)">
        <input
          type="text"
          maxLength={PAGEANT_CAUSE_MAX}
          value={value.cause}
          onChange={(e) => set({ cause: e.target.value })}
          className="input"
          placeholder="Ej.: pro fondos para la gira de fin de año."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Apertura de la votación (opcional)">
          <input
            type="date"
            value={value.opensAt}
            onChange={(e) => set({ opensAt: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Cierre de la votación (opcional)">
          <input
            type="date"
            value={value.closesAt}
            onChange={(e) => set({ closesAt: e.target.value })}
            className="input"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor por unidad de apoyo">
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={value.pricePerSupportUnit}
            onChange={(e) => set({ pricePerSupportUnit: e.target.value })}
            className="input"
            placeholder="Ej.: 5000"
          />
        </Field>
        <Field label="Moneda">
          <select
            value={value.currency}
            onChange={(e) => set({ currency: e.target.value as ProjectCurrency })}
            className="input"
          >
            {PROJECT_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">
        Es solo informativo: la plataforma nunca cobra. Cada quien le paga directo a la escuela por
        los métodos que ella publica, y la escuela confirma cada apoyo.
      </p>

      <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
        <p className="text-sm font-semibold text-foreground">Fórmula de la corona</p>
        <p className="mt-1 text-xs text-muted">
          La fórmula solo sugiere un orden; la escuela decide y corona a mano. Los pesos (jurado,
          apoyo económico y simpatía) deben sumar 100.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Jurado">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={value.jury}
              onChange={(e) => set({ jury: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Apoyo económico">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={value.support}
              onChange={(e) => set({ support: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Simpatía (voto libre)">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={value.sympathy}
              onChange={(e) => set({ sympathy: e.target.value })}
              className="input"
            />
          </Field>
        </div>
        <p
          className={`mt-2 text-xs ${weightSum === 100 ? "text-muted" : "text-error"}`}
          role="status"
        >
          Suma actual: {weightSum} / 100
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
        <input
          type="checkbox"
          checked={value.freeVotingEnabled}
          onChange={(e) => set({ freeVotingEnabled: e.target.checked })}
          className="mt-0.5 size-4"
        />
        <span className="text-sm">
          <span className="font-medium text-foreground">
            Activar el voto libre de simpatía
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Deja que cualquiera aplauda sin cuenta. Mantenlo apagado hasta que la protección
            antifraude esté activa: mientras tanto, la simpatía no pesa en la corona.
          </span>
        </span>
      </label>
    </div>
  );
}
