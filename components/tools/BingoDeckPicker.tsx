"use client";

/**
 * The reusable-deck (mazo) chooser shown in the bingo creation flow. A bingo's cartones come from a
 * deck — chosen here and copied into the new bingo — so picking one is REQUIRED (there's no longer
 * a way to add cartones after creation; they live in the mazo). Purely presentational: the parent
 * owns the deck list, the selection and the delete action, and enforces that a deck is picked. A
 * deck carries no money and no function-maintained signal — it's just a saved lote of cartones.
 */
import type { BingoDeckDoc } from "@/types";
import { formatBingoSummary } from "@/lib/format";

export function BingoDeckPicker({
  decks,
  selectedDeckId,
  onSelect,
  onDelete,
  deletingId,
  disabled = false,
}: {
  decks: BingoDeckDoc[];
  /** The chosen deck, or null for "create without a deck". */
  selectedDeckId: string | null;
  onSelect: (deckId: string | null) => void;
  onDelete: (deck: BingoDeckDoc) => void;
  /** The deck currently being deleted (disables its row), or null. */
  deletingId: string | null;
  /** Disable the whole control while the bingo is being created. */
  disabled?: boolean;
}) {
  const rowClass =
    "flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-black/5";

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 disabled:opacity-60">
      {decks.map((deck) => (
        <div key={deck.id} className={rowClass}>
          <label className="flex min-w-0 flex-1 items-center gap-3">
            <input
              type="radio"
              name="bingo-deck"
              className="size-4 shrink-0"
              checked={selectedDeckId === deck.id}
              onChange={() => onSelect(deck.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {deck.name}
              </span>
              <span className="block text-xs text-muted">
                {deck.cardCount} cartones · {formatBingoSummary(deck.format)}
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={() => onDelete(deck)}
            disabled={deletingId === deck.id}
            className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-error disabled:opacity-50"
          >
            {deletingId === deck.id ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      ))}
    </fieldset>
  );
}
