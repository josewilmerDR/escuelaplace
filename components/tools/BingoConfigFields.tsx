"use client";

/**
 * The bingo-specific configuration inputs, shared by the create and edit forms (the seam the
 * ToolTypePicker opens). Controlled: the parent owns a BingoFormValue and passes value + onChange.
 * Conversion to/from the stored BingoConfig (format parsing, pattern toggles + prizes, dates)
 * lives here so both pages share it. The cartones (lote) are NOT configured here — they're
 * generated/imported on the edit page via BingoCardsManager.
 */
import { Field } from "@/components/ui/Field";
import {
  bingoFormatError,
  toolDateFromInput,
  toolDateInputValue,
} from "@/lib/firestore";
import {
  BINGO_METHOD_MAX,
  BINGO_PATTERNS,
  BINGO_PATTERN_LABELS,
  BINGO_PRIZE_MAX,
  PROJECT_CURRENCIES,
  type BingoConfig,
  type BingoPattern,
  type ProjectCurrency,
} from "@/types";
import type { BingoConfigInput } from "@/lib/firestore";

/** One winning-pattern row as the form holds it (a checkbox + its prize text). */
interface PatternDraft {
  pattern: BingoPattern;
  enabled: boolean;
  prize: string;
}

/** Form-shaped bingo config (all strings/booleans, as the inputs hold them). */
export interface BingoFormValue {
  rows: string;
  cols: string;
  poolMin: string;
  poolMax: string;
  patterns: PatternDraft[];
  pricePerCard: string;
  currency: ProjectCurrency;
  eventDate: string; // YYYY-MM-DD
  drawMethod: string;
  contactPhone: string;
}

export function emptyBingoForm(): BingoFormValue {
  return {
    rows: "9",
    cols: "9",
    poolMin: "0",
    poolMax: "99",
    // "Cartón lleno" enabled by default; the school enables more lines as needed.
    patterns: BINGO_PATTERNS.map((p) => ({
      pattern: p,
      enabled: p === "full",
      prize: "",
    })),
    pricePerCard: "",
    currency: "CRC",
    eventDate: "",
    drawMethod: "",
    contactPhone: "",
  };
}

/** Hydrate the form from a stored config (edit page). */
export function bingoFormFromConfig(bingo: BingoConfig): BingoFormValue {
  const byPattern = new Map(bingo.patterns.map((p) => [p.pattern, p.prize]));
  return {
    rows: String(bingo.format.rows),
    cols: String(bingo.format.cols),
    poolMin: String(bingo.format.poolMin),
    poolMax: String(bingo.format.poolMax),
    patterns: BINGO_PATTERNS.map((p) => ({
      pattern: p,
      enabled: byPattern.has(p),
      prize: byPattern.get(p) ?? "",
    })),
    pricePerCard: String(bingo.pricePerCard),
    currency: bingo.currency,
    eventDate: toolDateInputValue(bingo.eventDate),
    drawMethod: bingo.drawMethod ?? "",
    contactPhone: bingo.contactPhone ?? "",
  };
}

/**
 * Validate + convert the form to a data-layer BingoConfigInput. Returns a Spanish error when
 * invalid. The grid/pool is validated by the shared bingoFormatError; at least one winning
 * pattern must be enabled and each enabled pattern needs a prize.
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

  const enabled = value.patterns.filter((p) => p.enabled);
  if (enabled.length === 0) {
    return { ok: false, error: "Activá al menos un patrón ganador." };
  }
  for (const p of enabled) {
    if (!p.prize.trim()) {
      return {
        ok: false,
        error: `Indicá el premio de «${BINGO_PATTERN_LABELS[p.pattern]}».`,
      };
    }
  }
  const price = Number(value.pricePerCard);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Ingresá un precio por cartón mayor a 0." };
  }
  const drawMethod = value.drawMethod.trim();
  const contactPhone = value.contactPhone.trim();
  return {
    ok: true,
    input: {
      format,
      patterns: enabled.map((p) => ({ pattern: p.pattern, prize: p.prize.trim() })),
      pricePerCard: price,
      currency: value.currency,
      eventDate: toolDateFromInput(value.eventDate),
      ...(drawMethod ? { drawMethod } : {}),
      ...(contactPhone ? { contactPhone } : {}),
    },
  };
}

export function BingoConfigFields({
  value,
  onChange,
  lockFormat = false,
}: {
  value: BingoFormValue;
  onChange: (v: BingoFormValue) => void;
  /** Disable the grid/pool inputs once cartones exist — changing the format would mismatch the
   * already-generated lote. */
  lockFormat?: boolean;
}) {
  const set = (patch: Partial<BingoFormValue>) => onChange({ ...value, ...patch });
  const setPattern = (pattern: BingoPattern, patch: Partial<PatternDraft>) =>
    set({
      patterns: value.patterns.map((p) =>
        p.pattern === pattern ? { ...p, ...patch } : p,
      ),
    });

  return (
    <div className="flex flex-col gap-4">
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
            ? "No se puede cambiar el formato porque ya hay cartones. Limpiá el lote para cambiarlo."
            : `Cada cartón tendrá ${Number(value.rows) * Number(value.cols) || "—"} casillas con números distintos del rango indicado.`}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">
          Formas de ganar y sus premios
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Una “línea” es una fila, columna o diagonal completa. Activá las que apliquen
          y escribí el premio de cada una.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {value.patterns.map((p) => (
            <div
              key={p.pattern}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <label className="flex min-h-10 min-w-44 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) =>
                    setPattern(p.pattern, { enabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-black/20 text-brand-darker focus:ring-brand"
                />
                {BINGO_PATTERN_LABELS[p.pattern]}
              </label>
              <input
                type="text"
                maxLength={BINGO_PRIZE_MAX}
                value={p.prize}
                disabled={!p.enabled}
                onChange={(e) => setPattern(p.pattern, { prize: e.target.value })}
                className="input flex-1 disabled:opacity-50"
                placeholder="Premio (ej.: ₡25.000)"
              />
            </div>
          ))}
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

      <Field label="WhatsApp para consultas (opcional)">
        <input
          type="tel"
          inputMode="tel"
          value={value.contactPhone}
          onChange={(e) => set({ contactPhone: e.target.value })}
          className="input"
          placeholder="Ej.: 8888 8888"
        />
      </Field>

      <p className="text-xs text-muted">
        Después de crear el bingo, generá o importá los cartones desde la página de
        edición. El público compra cartones y vos confirmás cada pago.
      </p>
    </div>
  );
}
