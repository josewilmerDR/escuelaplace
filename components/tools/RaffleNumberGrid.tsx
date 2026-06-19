/**
 * Presentational grid of raffle numbers (00–99). Each number is a "minitarjeta" showing only
 * the zero-padded number. State drives the look:
 *   available  → white, clickable (when onToggle is given)
 *   selected   → brand fill (the buyer's current pick, pre-checkout)
 *   reserved   → gray, not selectable (ordered, payment unconfirmed)
 *   sold       → red + struck through, not selectable (payment confirmed)
 *
 * Pure/presentational: no hooks. Read-only when `onToggle` is omitted (the manager preview);
 * interactive when given (the public board). Imported only by client components, so it bundles
 * as client without needing its own directive.
 */
import type { RaffleNumberState } from "@/lib/firestore";

const CELL_BASE =
  "flex h-10 items-center justify-center rounded-lg text-sm font-semibold tabular-nums ring-1 transition-colors";

function cellClass(state: RaffleNumberState, selected: boolean): string {
  if (selected) return `${CELL_BASE} bg-brand text-white ring-brand`;
  switch (state) {
    case "available":
      return `${CELL_BASE} bg-white text-foreground ring-black/5 hover:ring-brand hover:text-brand-darker cursor-pointer`;
    case "reserved":
      return `${CELL_BASE} bg-gray-100 text-gray-400 ring-black/5 cursor-not-allowed`;
    case "sold":
      return `${CELL_BASE} bg-red-50 text-red-400 line-through ring-black/5 cursor-not-allowed`;
  }
}

function stateLabel(state: RaffleNumberState): string {
  return state === "available"
    ? "disponible"
    : state === "reserved"
      ? "reservado, pago sin confirmar"
      : "vendido";
}

export function RaffleNumberGrid({
  count,
  states,
  selected,
  onToggle,
}: {
  count: number;
  states: RaffleNumberState[];
  /** Currently picked numbers (interactive mode). */
  selected?: Set<number>;
  /** Toggle handler; omit for a read-only preview. */
  onToggle?: (n: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {Array.from({ length: count }, (_, n) => {
        const state = states[n] ?? "available";
        const isSelected = selected?.has(n) ?? false;
        const label = String(n).padStart(2, "0");
        const a11y = `Número ${label} — ${isSelected ? "seleccionado" : stateLabel(state)}`;
        // Taken numbers (reserved/sold) are never selectable; available ones only when interactive.
        const disabled = state !== "available";
        if (!onToggle || disabled) {
          return (
            <span
              key={n}
              className={cellClass(state, isSelected)}
              aria-label={a11y}
              title={a11y}
            >
              {label}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            onClick={() => onToggle(n)}
            aria-pressed={isSelected}
            aria-label={a11y}
            className={cellClass(state, isSelected)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Small legend explaining the cell states. */
export function RaffleNumberLegend() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-white ring-1 ring-black/10" />
        Disponible
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-brand" />
        Seleccionado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-gray-200" />
        Reservado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-red-100" />
        Vendido
      </li>
    </ul>
  );
}
