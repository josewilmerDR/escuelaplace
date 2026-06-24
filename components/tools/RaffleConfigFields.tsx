"use client";

/**
 * The raffle-specific configuration inputs, shared by the create and edit forms (the seam the
 * ToolTypePicker opens: a raffle gets its own fields instead of the generic ones). Controlled:
 * the parent owns a RaffleFormValue and passes value + onChange. Conversion to/from the stored
 * RaffleConfig (dates, number parsing, prize trimming) lives here too so both pages share it.
 */
import { Field } from "@/components/ui/Field";
import { toolDateFromInput, toolDateInputValue } from "@/lib/firestore";
import {
  PROJECT_CURRENCIES,
  RAFFLE_METHOD_MAX,
  RAFFLE_NUMBER_COUNT,
  RAFFLE_PRIZE_MAX,
  type ProjectCurrency,
  type RaffleConfig,
} from "@/types";
import type { RaffleConfigInput } from "@/lib/firestore";

/** Form-shaped raffle config (all strings, as the inputs hold them). */
export interface RaffleFormValue {
  drawDate: string; // YYYY-MM-DD
  pricePerNumber: string;
  currency: ProjectCurrency;
  /** [first, second, third] — first required. */
  prizes: [string, string, string];
  drawMethod: string;
}

export function emptyRaffleForm(): RaffleFormValue {
  return {
    drawDate: "",
    pricePerNumber: "",
    currency: "CRC",
    prizes: ["", "", ""],
    drawMethod: "",
  };
}

/** Hydrate the form from a stored config (edit page). */
export function raffleFormFromConfig(raffle: RaffleConfig): RaffleFormValue {
  return {
    drawDate: toolDateInputValue(raffle.drawDate),
    pricePerNumber: String(raffle.pricePerNumber),
    currency: raffle.currency,
    prizes: [
      raffle.prizes[0] ?? "",
      raffle.prizes[1] ?? "",
      raffle.prizes[2] ?? "",
    ],
    drawMethod: raffle.drawMethod,
  };
}

/**
 * Validate + convert the form to a data-layer RaffleConfigInput. Returns an error message
 * (Spanish) when invalid so the page can surface it instead of writing junk.
 */
export function toRaffleInput(
  value: RaffleFormValue,
):
  | { ok: true; input: RaffleConfigInput }
  | { ok: false; error: string } {
  const prizes = value.prizes.map((p) => p.trim());
  if (!prizes[0]) {
    return { ok: false, error: "Ingresa al menos el primer premio." };
  }
  // Prizes are ordered 1→2→3 and must be contiguous: a 3rd prize without a 2nd would, after
  // dropping empties, silently shift down a slot (the 3rd would reappear as the 2nd on
  // re-edit). Require the gap be filled so filter(Boolean) below is order-preserving.
  if (prizes[2] && !prizes[1]) {
    return { ok: false, error: "Completa el segundo premio antes del tercero." };
  }
  const price = Number(value.pricePerNumber);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Ingresa un precio por número mayor a 0." };
  }
  const drawMethod = value.drawMethod.trim();
  if (!drawMethod) {
    return { ok: false, error: "Indica la modalidad del sorteo." };
  }
  return {
    ok: true,
    input: {
      drawDate: toolDateFromInput(value.drawDate),
      pricePerNumber: price,
      currency: value.currency,
      // Keep order; drop empty optional prizes (so a missing 2nd but present 3rd collapses).
      prizes: prizes.filter(Boolean),
      drawMethod,
    },
  };
}

export function RaffleConfigFields({
  value,
  onChange,
}: {
  value: RaffleFormValue;
  onChange: (v: RaffleFormValue) => void;
}) {
  const set = (patch: Partial<RaffleFormValue>) =>
    onChange({ ...value, ...patch });
  const setPrize = (i: 0 | 1 | 2, s: string) => {
    const prizes: [string, string, string] = [
      value.prizes[0],
      value.prizes[1],
      value.prizes[2],
    ];
    prizes[i] = s;
    set({ prizes });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Fecha de sorteo (opcional)">
        <input
          type="date"
          value={value.drawDate}
          onChange={(e) => set({ drawDate: e.target.value })}
          className="input"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Precio por número">
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={value.pricePerNumber}
            onChange={(e) => set({ pricePerNumber: e.target.value })}
            className="input"
            placeholder="Ej.: 1000"
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

      <div>
        <p className="text-sm font-medium text-foreground">Premios</p>
        <div className="mt-2 flex flex-col gap-3">
          <Field label="Primer premio (obligatorio)">
            <input
              type="text"
              required
              maxLength={RAFFLE_PRIZE_MAX}
              value={value.prizes[0]}
              onChange={(e) => setPrize(0, e.target.value)}
              className="input"
              placeholder="Ej.: ₡100.000 en efectivo"
            />
          </Field>
          <Field label="Segundo premio (opcional)">
            <input
              type="text"
              maxLength={RAFFLE_PRIZE_MAX}
              value={value.prizes[1]}
              onChange={(e) => setPrize(1, e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Tercer premio (opcional)">
            <input
              type="text"
              maxLength={RAFFLE_PRIZE_MAX}
              value={value.prizes[2]}
              onChange={(e) => setPrize(2, e.target.value)}
              className="input"
            />
          </Field>
        </div>
      </div>

      <Field label="Modalidad del sorteo">
        <input
          type="text"
          maxLength={RAFFLE_METHOD_MAX}
          value={value.drawMethod}
          onChange={(e) => set({ drawMethod: e.target.value })}
          className="input"
          placeholder="Ej.: En combinación con la Lotería Nacional"
        />
      </Field>

      <p className="text-xs text-muted">
        La rifa tiene {RAFFLE_NUMBER_COUNT} números (00–99) por ahora. El público
        los elige y aparta desde la página de la rifa; tú confirmas cada pago.
      </p>
    </div>
  );
}
