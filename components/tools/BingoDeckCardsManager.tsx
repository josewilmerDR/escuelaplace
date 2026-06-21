"use client";

/**
 * Manager for a reusable deck's (mazo) cartones, on the dedicated deck detail page
 * (/panel/school/[id]/bingo-decks/[deckId]). It targets a DECK, not a bingo tool: a deck card
 * carries no sold/owner state (those exist only once a deck is copied into a bingo), so every
 * cartón is freely deletable and there's no "vendido" gating. It shows the WHOLE deck — the board's
 * reason for a dedicated page is to review every cartón. After each change it refreshes the deck's
 * denormalized cardCount.
 *
 * The school can GENERATE random cartones, IMPORT pre-printed ones (paste, one per line), see them
 * all, and delete one or clear the deck. Writes are the school's alone (firestore.rules).
 */
import { useCallback, useEffect, useState } from "react";
import { BingoCardGrid } from "@/components/tools/BingoCardGrid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { userErrorMessage } from "@/lib/errors";
import {
  clearBingoDeckCards,
  deleteBingoDeckCard,
  generateBingoDeckCards,
  getBingoDeckCards,
  importBingoDeckCards,
  nextCardStartNumber,
  parseImportedCards,
  setBingoDeckCardCount,
} from "@/lib/firestore";
import { BINGO_CARD_MAX, type BingoDeckCardDoc, type BingoFormat } from "@/types";

export function BingoDeckCardsManager({
  schoolId,
  deckId,
  format,
  onCountChange,
}: {
  schoolId: string;
  deckId: string;
  format: BingoFormat;
  /** Reports the current deck size up to the page (which shows it in the header). */
  onCountChange?: (count: number) => void;
}) {
  const [cards, setCards] = useState<BingoDeckCardDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genCount, setGenCount] = useState("50");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(async (): Promise<BingoDeckCardDoc[]> => {
    const cs = await getBingoDeckCards(schoolId, deckId);
    setCards(cs);
    return cs;
  }, [schoolId, deckId]);

  const load = useCallback(() => {
    getBingoDeckCards(schoolId, deckId)
      .then((cs) => {
        setCards(cs);
        onCountChange?.(cs.length);
      })
      .catch(() => setError("No pudimos cargar los cartones del mazo."))
      .finally(() => setLoading(false));
    // onCountChange is a stable setState dispatcher from the page; excluded to avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, deckId]);

  useEffect(load, [load]);

  const total = cards.length;

  /** Run a mutation, then reload and refresh the deck's denormalized cardCount. */
  const run = async (op: () => Promise<void>, fallback: string) => {
    setError(null);
    setBusy(true);
    try {
      await op();
      const cs = await reload();
      await setBingoDeckCardCount(schoolId, deckId, cs.length);
      onCountChange?.(cs.length);
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
        `El mazo no puede superar ${BINGO_CARD_MAX} cartones (ya hay ${total}).`,
      );
      return;
    }
    run(
      () =>
        generateBingoDeckCards(
          schoolId,
          deckId,
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
        `El mazo no puede superar ${BINGO_CARD_MAX} cartones (ya hay ${total}).`,
      );
      return;
    }
    run(async () => {
      await importBingoDeckCards(schoolId, deckId, parsed.cards);
      setImportText("");
      setShowImport(false);
    }, "No se pudieron importar los cartones.");
  };

  const onClear = () => {
    setConfirmClear(false);
    run(
      () => clearBingoDeckCards(schoolId, deckId),
      "No se pudo limpiar el mazo.",
    );
  };

  const onDeleteCard = (card: BingoDeckCardDoc) =>
    run(
      () => deleteBingoDeckCard(schoolId, deckId, card.id),
      "No se pudo quitar el cartón.",
    );

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Cartones del mazo
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {loading ? "Cargando cartones…" : `${total} cartones.`}
        </p>
      </div>

      {!loading && total === 0 && (
        <p className="rounded-xl bg-brand-tint p-3 text-sm text-brand-darker ring-1 ring-brand-darker/10">
          Generá (o importá) los cartones de este mazo. Después podrás reutilizarlo al
          crear un bingo.
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

      {/* Every cartón of the deck — the whole point of the dedicated page. */}
      {total > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground">
            Todos los cartones ({total})
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {cards.map((card) => (
              <li key={card.id} className="flex flex-col gap-1">
                <BingoCardGrid
                  label={card.label}
                  numbers={card.numbers}
                  cols={format.cols}
                />
                <button
                  type="button"
                  onClick={() => onDeleteCard(card)}
                  disabled={busy}
                  className="self-start text-xs font-medium text-muted transition-colors hover:text-error"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > 0 && (
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          disabled={busy}
          className="self-start text-xs font-medium text-muted transition-colors hover:text-error disabled:opacity-50"
        >
          Limpiar mazo
        </button>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Limpiar el mazo"
        confirmLabel="Limpiar"
        busy={busy}
        onConfirm={onClear}
        onCancel={() => setConfirmClear(false)}
      >
        <p className="text-sm text-muted">
          Se eliminarán los {total} cartones de este mazo. No se puede deshacer. Los
          bingos que ya lo usaron conservan sus cartones.
        </p>
      </ConfirmDialog>
    </div>
  );
}
