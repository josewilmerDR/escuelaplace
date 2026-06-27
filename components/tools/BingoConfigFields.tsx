"use client";

/**
 * The bingo-specific configuration inputs, shared by the create and edit forms (the seam the
 * ToolTypePicker opens). Controlled: the parent owns a BingoFormValue and passes value + onChange.
 * Conversion to/from the stored BingoConfig (format parsing, pattern toggles + prizes, dates)
 * lives here so both pages share it. The cartones (lote) are NOT configured here — they live in a
 * reusable mazo (deck), authored on the Mazos page and bound to the bingo at creation.
 */
import { Field } from "@/components/ui/Field";
import {
  bingoFormatError,
  toolDateFromInput,
  toolDateInputValue,
} from "@/lib/firestore";
import {
  BINGO_METHOD_MAX,
  BINGO_OTHER_PRIZES_MAX,
  BINGO_PRIZE_MAX,
  PROJECT_CURRENCIES,
  type BingoConfig,
  type ProjectCurrency,
} from "@/types";
import type { BingoConfigInput } from "@/lib/firestore";

/** Form-shaped bingo config (all strings, as the inputs hold them). */
export interface BingoFormValue {
  rows: string;
  cols: string;
  poolMin: string;
  poolMax: string;
  /** Premio mayor (required), then optional 2nd/3rd, then extra unranked prizes (add/remove). */
  prizeFirst: string;
  prizeSecond: string;
  prizeThird: string;
  prizeOthers: string[];
  pricePerCard: string;
  currency: ProjectCurrency;
  eventDate: string; // YYYY-MM-DD
  drawMethod: string;
  contactPhone: string;
  /** Easy mode (the grid only lets players tap called numbers). Default off = traditional. */
  assistMarking: boolean;
}

export function emptyBingoForm(): BingoFormValue {
  return {
    rows: "5",
    cols: "5",
    poolMin: "0",
    poolMax: "75",
    prizeFirst: "",
    prizeSecond: "",
    prizeThird: "",
    prizeOthers: [],
    pricePerCard: "",
    currency: "CRC",
    eventDate: "",
    drawMethod: "",
    contactPhone: "",
    assistMarking: false,
  };
}

/** Hydrate the form from a stored config (edit page). */
export function bingoFormFromConfig(bingo: BingoConfig): BingoFormValue {
  // `prizes` is absent on legacy bingos (created before prizes were decoupled from patterns).
  const prizes = bingo.prizes;
  return {
    rows: String(bingo.format.rows),
    cols: String(bingo.format.cols),
    poolMin: String(bingo.format.poolMin),
    poolMax: String(bingo.format.poolMax),
    prizeFirst: prizes?.first ?? "",
    prizeSecond: prizes?.second ?? "",
    prizeThird: prizes?.third ?? "",
    prizeOthers: prizes?.others ?? [],
    pricePerCard: String(bingo.pricePerCard),
    currency: bingo.currency,
    eventDate: toolDateInputValue(bingo.eventDate),
    drawMethod: bingo.drawMethod ?? "",
    contactPhone: bingo.contactPhone ?? "",
    assistMarking: bingo.assistMarking ?? false,
  };
}

/**
 * Validate + convert the form to a data-layer BingoConfigInput. Returns a Spanish error when
 * invalid. The grid/pool is validated by the shared bingoFormatError; the premio mayor is
 * required and (like the rifa) the third prize can't be filled without the second, so dropping
 * empty optionals never silently shifts a prize down a rank. The "otros" are trimmed and emptied
 * ones dropped. Winning patterns are NOT collected here — buildBingoConfig defaults them for the
 * live event.
 */
export function toBingoInput(
  value: BingoFormValue,
): { ok: true; input: BingoConfigInput } | { ok: false; error: string } {
  const format = {
    rows: Number(value.rows),
    cols: Number(value.cols),
    poolMin: Number(value.poolMin),
    poolMax: Number(value.poolMax),
  };
  const fmtErr = bingoFormatError(format);
  if (fmtErr) return { ok: false, error: fmtErr };

  const first = value.prizeFirst.trim();
  if (!first) {
    return { ok: false, error: "Ingresa el premio mayor." };
  }
  const second = value.prizeSecond.trim();
  const third = value.prizeThird.trim();
  if (third && !second) {
    return { ok: false, error: "Completa el segundo premio antes del tercero." };
  }
  const others = value.prizeOthers.map((p) => p.trim()).filter(Boolean);

  const price = Number(value.pricePerCard);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Ingresa un precio por cartón mayor a 0." };
  }
  const drawMethod = value.drawMethod.trim();
  return {
    ok: true,
    input: {
      format,
      prizes: {
        first,
        ...(second ? { second } : {}),
        ...(third ? { third } : {}),
        others,
      },
      pricePerCard: price,
      currency: value.currency,
      eventDate: toolDateFromInput(value.eventDate),
      ...(drawMethod ? { drawMethod } : {}),
      ...(value.assistMarking ? { assistMarking: true } : {}),
    },
  };
}

export function BingoConfigFields({
  value,
  onChange,
  lockFormat = false,
  hideFormat = false,
}: {
  value: BingoFormValue;
  onChange: (v: BingoFormValue) => void;
  /** Disable the grid/pool inputs once cartones exist — changing the format would mismatch the
   * already-generated lote. */
  lockFormat?: boolean;
  /** Hide the grid/pool section entirely. The format is fixed for now (5×5, 0–75) and not
   * configurable, so the board never sees these inputs — but the values still flow through
   * `value` into the stored config. Drop this prop to re-expose the section. */
  hideFormat?: boolean;
}) {
  const set = (patch: Partial<BingoFormValue>) => onChange({ ...value, ...patch });
  const setOther = (i: number, s: string) =>
    set({ prizeOthers: value.prizeOthers.map((p, j) => (j === i ? s : p)) });
  const addOther = () => set({ prizeOthers: [...value.prizeOthers, ""] });
  const removeOther = (i: number) =>
    set({ prizeOthers: value.prizeOthers.filter((_, j) => j !== i) });

  return (
    <div className="flex flex-col gap-4">
      {!hideFormat && (
      <div>
        <p className="text-sm font-medium text-foreground">Formato del cartón</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Filas">
            <input
              type="number"
              inputMode="numeric"
              min={3}
              max={9}
              disabled={lockFormat}
              value={value.rows}
              onChange={(e) => set({ rows: e.target.value })}
              className="input disabled:opacity-50"
            />
          </Field>
          <Field label="Columnas">
            <input
              type="number"
              inputMode="numeric"
              min={3}
              max={9}
              disabled={lockFormat}
              value={value.cols}
              onChange={(e) => set({ cols: e.target.value })}
              className="input disabled:opacity-50"
            />
          </Field>
          <Field label="Número menor">
            <input
              type="number"
              inputMode="numeric"
              disabled={lockFormat}
              value={value.poolMin}
              onChange={(e) => set({ poolMin: e.target.value })}
              className="input disabled:opacity-50"
              placeholder="Ej.: 0"
            />
          </Field>
          <Field label="Número mayor">
            <input
              type="number"
              inputMode="numeric"
              disabled={lockFormat}
              value={value.poolMax}
              onChange={(e) => set({ poolMax: e.target.value })}
              className="input disabled:opacity-50"
              placeholder="Ej.: 99"
            />
          </Field>
        </div>
        <p className="mt-1 text-xs text-muted">
          {lockFormat
            ? "No se puede cambiar el formato porque ya hay cartones. Limpia el lote para cambiarlo."
            : `Cada cartón tendrá ${Number(value.rows) * Number(value.cols) || "—"} casillas con números distintos del rango indicado.`}
        </p>
      </div>
      )}

      <div>
        <p className="text-sm font-medium text-foreground">Premios</p>
        <p className="mt-0.5 text-xs text-muted">
          Indica los premios del bingo. El premio mayor es obligatorio.
        </p>
        <div className="mt-2 flex flex-col gap-3">
          <Field label="Premio mayor (obligatorio)">
            <input
              type="text"
              required
              maxLength={BINGO_PRIZE_MAX}
              value={value.prizeFirst}
              onChange={(e) => set({ prizeFirst: e.target.value })}
              className="input"
              placeholder="Ej.: ₡100.000 en efectivo"
            />
          </Field>
          <Field label="Segundo premio (opcional)">
            <input
              type="text"
              maxLength={BINGO_PRIZE_MAX}
              value={value.prizeSecond}
              onChange={(e) => set({ prizeSecond: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Tercer premio (opcional)">
            <input
              type="text"
              maxLength={BINGO_PRIZE_MAX}
              value={value.prizeThird}
              onChange={(e) => set({ prizeThird: e.target.value })}
              className="input"
            />
          </Field>
        </div>

        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">Otros premios</p>
          <p className="mt-0.5 text-xs text-muted">
            Premios adicionales a los tres anteriores, sin orden.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {value.prizeOthers.map((prize, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={BINGO_PRIZE_MAX}
                  value={prize}
                  onChange={(e) => setOther(i, e.target.value)}
                  className="input flex-1"
                  placeholder={`Otro premio ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeOther(i)}
                  className="btn btn-outline shrink-0"
                >
                  Quitar
                </button>
              </div>
            ))}
            {value.prizeOthers.length < BINGO_OTHER_PRIZES_MAX ? (
              <button
                type="button"
                onClick={addOther}
                className="btn btn-outline self-start"
              >
                Agregar otro premio
              </button>
            ) : (
              <span className="text-xs text-muted">
                Máximo {BINGO_OTHER_PRIZES_MAX} premios adicionales.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Precio por cartón">
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={value.pricePerCard}
            onChange={(e) => set({ pricePerCard: e.target.value })}
            className="input"
            placeholder="Ej.: 1500"
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

      <Field label="Fecha del evento (opcional)">
        <input
          type="date"
          value={value.eventDate}
          onChange={(e) => set({ eventDate: e.target.value })}
          className="input"
        />
      </Field>

      <Field label="Modalidad (opcional)">
        <input
          type="text"
          maxLength={BINGO_METHOD_MAX}
          value={value.drawMethod}
          onChange={(e) => set({ drawMethod: e.target.value })}
          className="input"
          placeholder="Ej.: Presencial en el gimnasio, transmitido en vivo"
        />
      </Field>

      <div>
        <p className="text-sm font-medium text-foreground">Cómo marcan los jugadores</p>
        <label className="mt-2 flex items-start gap-3">
          <input
            type="checkbox"
            checked={value.assistMarking}
            onChange={(e) => set({ assistMarking: e.target.checked })}
            className="mt-0.5 size-4 shrink-0"
          />
          <span className="text-sm text-foreground">
            Modo fácil: el cartón solo deja marcar números ya cantados.
            <span className="mt-0.5 block text-xs text-muted">
              Por defecto está apagado (modo tradicional): cada jugador marca su
              cartón a mano y puede equivocarse, igual que en un cartón físico; por eso
              la escuela revisa cada «¡Bingo!» antes de dar el premio. Activa el modo
              fácil para que el sistema impida marcar números no cantados (menos
              fricción, pero los jugadores online quedan en ventaja sobre los de cartón
              físico).
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
