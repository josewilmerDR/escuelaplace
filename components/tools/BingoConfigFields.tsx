"use client";

/**
 * The bingo-specific configuration inputs, shared by the create and edit forms (the seam the
 * ToolTypePicker opens). Controlled: the parent owns a BingoFormValue and passes value + onChange.
 * Conversion to/from the stored BingoConfig (format parsing, pattern toggles + prizes, dates)
 * lives here so both pages share it. The cartones (lote) are NOT configured here — they live in a
 * reusable mazo (deck), authored on the Mazos page and bound to the bingo at creation.
 */
import { useRef, useState } from "react";
import Image from "next/image";
import { BingoCenterCell } from "@/components/tools/BingoCardGrid";
import { Field } from "@/components/ui/Field";
import { validateImageFile } from "@/components/ui/ImagePicker";
import {
  bingoFormatError,
  toolDateFromInput,
  toolDateInputValue,
  uploadToolCenterImage,
} from "@/lib/firestore";
import {
  BINGO_CENTER_TEXT_MAX,
  BINGO_METHOD_MAX,
  BINGO_OTHER_PRIZES_MAX,
  BINGO_PRIZE_MAX,
  PROJECT_CURRENCIES,
  type BingoCenterSquare,
  type BingoConfig,
  type ProjectCurrency,
} from "@/types";
import type { BingoConfigInput } from "@/lib/firestore";

/** Center-square form modes: 'normal' = traditional numbered center (no free space). */
type BingoCenterMode = "normal" | BingoCenterSquare["type"];

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
  /** Classic 5×5 center: 'normal' = numbered (default); 'blank'/'text'/'image' = free space. */
  centerSquareType: BingoCenterMode;
  /** Free-space label (centerSquareType === 'text'). */
  centerSquareText: string;
  /** Uploaded logo URL (centerSquareType === 'image'); set eagerly when the image is picked. */
  centerSquareImageUrl: string;
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
    centerSquareType: "normal",
    centerSquareText: "",
    centerSquareImageUrl: "",
  };
}

/** Hydrate the form from a stored config (edit page). */
export function bingoFormFromConfig(bingo: BingoConfig): BingoFormValue {
  // `prizes` is absent on legacy bingos (created before prizes were decoupled from patterns).
  const prizes = bingo.prizes;
  // Absent center square = traditional numbered center; otherwise hydrate the chosen free-space mode.
  const center = bingo.centerSquare;
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
    centerSquareType: center?.type ?? "normal",
    centerSquareText: center?.type === "text" ? (center.text ?? "") : "",
    centerSquareImageUrl: center?.type === "image" ? (center.imageUrl ?? "") : "",
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

  // Center square: offered (and stored) only on the classic 5×5, where there's a single middle cell.
  // Off any other grid — or set to 'normal' — it's dropped, so the center stays a numbered cell.
  const centerResult = toCenterSquare(value, format);
  if (!centerResult.ok) return centerResult;
  const centerSquare = centerResult.value;

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
      ...(centerSquare ? { centerSquare } : {}),
    },
  };
}

/** True only on the classic 5×5 grid — the one cartón with a single middle cell to free up. */
function isClassicGrid(format: { rows: number; cols: number }): boolean {
  return format.rows === 5 && format.cols === 5;
}

/**
 * Validate + convert the center-square form fields into a BingoCenterSquare (or undefined for a
 * traditional numbered center). Returns a Spanish error when 'text'/'image' is chosen without its
 * content. Non-5×5 grids (or 'normal') drop the center entirely.
 */
function toCenterSquare(
  value: BingoFormValue,
  format: { rows: number; cols: number },
): { ok: true; value: BingoCenterSquare | undefined } | { ok: false; error: string } {
  if (!isClassicGrid(format) || value.centerSquareType === "normal") {
    return { ok: true, value: undefined };
  }
  if (value.centerSquareType === "text") {
    const text = value.centerSquareText.trim().slice(0, BINGO_CENTER_TEXT_MAX);
    if (!text) {
      return {
        ok: false,
        error: "Escribe el texto de la casilla central o elige otra opción.",
      };
    }
    return { ok: true, value: { type: "text", text } };
  }
  if (value.centerSquareType === "image") {
    if (!value.centerSquareImageUrl) {
      return {
        ok: false,
        error: "Sube la imagen de la casilla central o elige otra opción.",
      };
    }
    return { ok: true, value: { type: "image", imageUrl: value.centerSquareImageUrl } };
  }
  return { ok: true, value: { type: "blank" } };
}

export function BingoConfigFields({
  value,
  onChange,
  lockFormat = false,
  hideFormat = false,
  schoolId,
  toolId,
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
  /** School + tool ids, needed only to eagerly upload a center-square logo to the tool's Storage
   * path. The create page pre-allocates the tool id; the edit page passes the real one. */
  schoolId?: string;
  toolId?: string;
}) {
  const set = (patch: Partial<BingoFormValue>) => onChange({ ...value, ...patch });
  // The center square exists only on the classic 5×5 (the one grid with a single middle cell).
  const is5x5 = Number(value.rows) === 5 && Number(value.cols) === 5;
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

      {is5x5 && (
        <div>
          <p className="text-sm font-medium text-foreground">
            Casilla central (5×5)
          </p>
          <p className="mt-0.5 text-xs text-muted">
            En el bingo clásico, la casilla del centro es un espacio libre (se marca
            sola). Personalízala con el logo de la escuela, un texto, o déjala en blanco.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex-1">
              <Field label="Centro del cartón">
                <select
                  value={value.centerSquareType}
                  onChange={(e) =>
                    set({ centerSquareType: e.target.value as BingoCenterMode })
                  }
                  className="input"
                >
                  <option value="normal">Número normal (sin espacio libre)</option>
                  <option value="blank">Libre — en blanco</option>
                  <option value="text">Libre — con texto</option>
                  <option value="image">Libre — con imagen (logo)</option>
                </select>
              </Field>
              {value.centerSquareType === "text" && (
                <div className="mt-3">
                  <Field label="Texto del centro">
                    <input
                      type="text"
                      maxLength={BINGO_CENTER_TEXT_MAX}
                      value={value.centerSquareText}
                      onChange={(e) => set({ centerSquareText: e.target.value })}
                      className="input"
                      placeholder="Ej.: LIBRE"
                    />
                  </Field>
                </div>
              )}
              {value.centerSquareType === "image" && (
                <div className="mt-3">
                  <BingoCenterImageField
                    schoolId={schoolId}
                    toolId={toolId}
                    url={value.centerSquareImageUrl}
                    onChange={(url) => set({ centerSquareImageUrl: url })}
                  />
                </div>
              )}
              {value.centerSquareType !== "normal" && (
                <p className="mt-2 text-xs text-muted">
                  El centro no llevará número: cuenta como marcado para todos los
                  patrones que pasan por ahí.
                </p>
              )}
            </div>
            {value.centerSquareType !== "normal" && (
              <div className="shrink-0">
                <p className="mb-1 text-xs text-muted">Vista previa</p>
                <div className="w-16">
                  <BingoCenterCell centerSquare={centerPreviewOf(value)} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

/** The BingoCenterSquare the preview cell shows for the current form state (live, before save). */
function centerPreviewOf(value: BingoFormValue): BingoCenterSquare {
  if (value.centerSquareType === "text") {
    return { type: "text", text: value.centerSquareText.trim() };
  }
  if (value.centerSquareType === "image") {
    return { type: "image", imageUrl: value.centerSquareImageUrl };
  }
  return { type: "blank" };
}

/**
 * The center-square logo input: picks an image, uploads it immediately to the tool's Storage path
 * (the id is pre-allocated on create, real on edit) and reports back the download URL — the same
 * eager-upload pattern as tour/service media. Replacing leaves the old blob orphaned (harmless).
 */
function BingoCenterImageField({
  schoolId,
  toolId,
  url,
  onChange,
}: {
  schoolId?: string;
  toolId?: string;
  url: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }
    if (!schoolId || !toolId) {
      setError("Guarda el bingo antes de subir la imagen.");
      e.target.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadToolCenterImage(schoolId, toolId, file);
      onChange(uploaded);
    } catch {
      setError("No se pudo subir la imagen. Intenta de nuevo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-sm font-medium text-foreground">Imagen del centro</span>
      <div className="mt-1 flex items-center gap-3">
        <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-white ring-1 ring-black/10">
          {url ? (
            <Image src={url} alt="" fill sizes="64px" className="object-contain p-1" />
          ) : (
            <span className="text-[10px] text-muted">Sin imagen</span>
          )}
        </span>
        <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
          {uploading ? "Subiendo…" : url ? "Cambiar imagen" : "Subir imagen"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Imagen de la casilla central"
            onChange={onFile}
          />
        </label>
        {url && !uploading && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
          >
            Quitar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
