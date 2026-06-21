"use client";

/**
 * The edit-page manager for a bingo's cartones (the lote). Like per-item media, the cartones live
 * in Firestore and persist IMMEDIATELY against the SAVED tool, so this only renders once the bingo
 * config exists (the parent passes the persisted `format`). The school can GENERATE random
 * cartones, IMPORT pre-printed ones (paste, one per line), preview the lote, and clear/delete.
 *
 * Cartones are written only by the school (rules); a sold cartón (already assigned to a buyer on a
 * confirmed order) can't be deleted from here and blocks clearing the whole lote — so an
 * assignment is never silently orphaned.
 */
import { useCallback, useEffect, useState } from "react";
import { BingoCardGrid } from "@/components/tools/BingoCardGrid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { userErrorMessage } from "@/lib/errors";
import {
  clearBingoCards,
  deleteBingoCard,
  generateBingoCards,
  getBingoCards,
  importBingoCards,
  nextCardStartNumber,
  parseImportedCards,
} from "@/lib/firestore";
import { BINGO_CARD_MAX, type BingoCardDoc, type BingoFormat } from "@/types";

const PREVIEW_COUNT = 6;

export function BingoCardsManager({
  schoolId,
  toolId,
  format,
  onCountChange,
}: {
  schoolId: string;
  toolId: string;
  format: BingoFormat;
  /** Reports the current lote size up to the edit page (which locks the format once cards exist). */
  onCountChange?: (count: number) => void;
}) {
  const [cards, setCards] = useState<BingoCardDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genCount, setGenCount] = useState("50");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(async () => {
    setCards(await getBingoCards(schoolId, toolId));
  }, [schoolId, toolId]);

  const load = useCallback(() => {
    getBingoCards(schoolId, toolId)
      .then(setCards)
      .catch(() => setError("No pudimos cargar los cartones."))
      .finally(() => setLoading(false));
  }, [schoolId, toolId]);

  useEffect(load, [load]);

  const soldCount = cards.filter((c) => c.status === "sold").length;
  const total = cards.length;

  // Report the lote size up so the edit page can lock the format once cartones exist.
  useEffect(() => {
    onCountChange?.(total);
  }, [total, onCountChange]);

  const run = async (op: () => Promise<void>, fallback: string) => {
    setError(null);
    setBusy(true);
    try {
      await op();
      await reload();
    } catch (err) {
      setError(userErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = () => {
    const count = Number(genCount);
    if (!Number.isInteger(count) || count <= 0) {
      setError("Indicá cuántos cartones generar (un entero mayor a 0).");
      return;
    }
    if (total + count > BINGO_CARD_MAX) {
      setError(
        `El lote no puede superar ${BINGO_CARD_MAX} cartones (ya hay ${total}).`,
      );
      return;
    }
    run(
      () =>
        generateBingoCards(
          schoolId,
          toolId,
          format,
          count,
          nextCardStartNumber(cards),
        ),
      "No se pudieron generar los cartones.",
    );
  };

  const onImport = () => {
    const parsed = parseImportedCards(importText, format);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (total + parsed.cards.length > BINGO_CARD_MAX) {
      setError(
        `El lote no puede superar ${BINGO_CARD_MAX} cartones (ya hay ${total}).`,
      );
      return;
    }
    run(async () => {
      await importBingoCards(schoolId, toolId, parsed.cards);
      setImportText("");
      setShowImport(false);
    }, "No se pudieron importar los cartones.");
  };

  const onClear = () => {
    setConfirmClear(false);
    run(() => clearBingoCards(schoolId, toolId), "No se pudo limpiar el lote.");
  };

  const onDeleteCard = (card: BingoCardDoc) =>
    run(
      () => deleteBingoCard(schoolId, toolId, card.id),
      "No se pudo quitar el cartón.",
    );

  return (
    // This manager persists immediately (generate/import/clear), so its inputs must NOT bubble a
    // change event to the edit form's onChange dirty-tracker — stop it at the wrapper.
    <div
      onChange={(e) => e.stopPropagation()}
      className="flex flex-col gap-4 rounded-2xl bg-surface p-4 ring-1 ring-black/5"
    >
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Cartones del lote
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          {loading
            ? "Cargando cartones…"
            : `${total} cartones${soldCount > 0 ? ` · ${soldCount} vendidos` : ""}.`}
        </p>
      </div>

      {!loading && total === 0 && (
        <p className="rounded-xl bg-brand-tint p-3 text-sm text-brand-darker ring-1 ring-brand-darker/10">
          Generá (o importá) el lote de cartones para habilitar la compra: sin cartones,
          el público no puede comprar este bingo.
        </p>
      )}

      {/* Generate */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Generar cartones (aleatorios)">
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={genCount}
            onChange={(e) => setGenCount(e.target.value)}
            className="input sm:w-40"
            placeholder="Ej.: 50"
          />
        </Field>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="btn btn-outline"
        >
          {busy ? "Trabajando…" : "Generar"}
        </button>
      </div>

      {/* Import */}
      <div>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="text-sm font-medium text-brand-darker hover:underline"
        >
          {showImport ? "Ocultar importación" : "Importar cartones existentes"}
        </button>
        {showImport && (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="input font-mono text-xs"
              placeholder={`Un cartón por línea (${format.rows * format.cols} números separados por coma o espacio).\nCada columna usa su propio rango (col. 1: ${format.poolMin}–…, como el bingo tradicional).\nOpcional: un identificador y dos puntos al inicio.\nEj.: 001: 5, 12, 33, ...`}
            />
            <button
              type="button"
              onClick={onImport}
              disabled={busy}
              className="btn btn-outline self-start"
            >
              {busy ? "Importando…" : "Importar"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      {/* Preview */}
      {total > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground">
            Vista previa {total > PREVIEW_COUNT ? `(primeros ${PREVIEW_COUNT})` : ""}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cards.slice(0, PREVIEW_COUNT).map((card) => (
              <li key={card.id} className="flex flex-col gap-1">
                <BingoCardGrid
                  label={card.label}
                  numbers={card.numbers}
                  cols={format.cols}
                />
                {card.status === "available" ? (
                  <button
                    type="button"
                    onClick={() => onDeleteCard(card)}
                    disabled={busy}
                    className="self-start text-xs font-medium text-muted transition-colors hover:text-error"
                  >
                    Quitar
                  </button>
                ) : (
                  <span className="text-xs text-muted">Vendido</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > 0 && (
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          disabled={busy || soldCount > 0}
          className="self-start text-xs font-medium text-muted transition-colors hover:text-error disabled:opacity-50"
          title={
            soldCount > 0
              ? "No se puede limpiar: hay cartones vendidos."
              : undefined
          }
        >
          Limpiar lote
        </button>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Limpiar el lote"
        confirmLabel="Limpiar"
        busy={busy}
        onConfirm={onClear}
        onCancel={() => setConfirmClear(false)}
      >
        <p className="text-sm text-muted">
          Se eliminarán los {total} cartones de este bingo. No se puede deshacer.
        </p>
      </ConfirmDialog>
    </div>
  );
}
