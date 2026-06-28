"use client";

/**
 * Public, interactive raffle board (client island on the raffle detail page). Renders the
 * number grid (00–99) with server-computed states, lets the visitor pick AVAILABLE numbers
 * into a "Números tomados" tray, shows the running total, and sends them to the buy flow.
 *
 * The states are computed on the server at page load; a number taken by someone else between
 * load and checkout is re-validated on the buy page (and ultimately by the school at
 * confirmation). Selection is local; "Comprar" hands off to /panel/raffle (which requires
 * sign-in, like donating). PURELY INFORMATIONAL — the platform never processes the payment.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  RaffleNumberGrid,
  RaffleNumberLegend,
} from "@/components/tools/RaffleNumberGrid";
import { WarningIcon } from "@/components/ui/icons";
import type { RaffleNumberState } from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type { ProjectCurrency } from "@/types";

export function RaffleBoard({
  schoolId,
  toolId,
  numberCount,
  states,
  pricePerNumber,
  currency,
  verified,
}: {
  schoolId: string;
  toolId: string;
  numberCount: number;
  states: RaffleNumberState[];
  pricePerNumber: number;
  currency: ProjectCurrency;
  /** Whether the school is verified — buying is only possible then (mirrors donations). */
  verified: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (n: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const picked = [...selected].sort((a, b) => a - b);
  const total = picked.length * pricePerNumber;

  const buy = () => {
    if (picked.length === 0) return;
    router.push(
      `/panel/raffle?schoolId=${schoolId}&toolId=${toolId}&numbers=${picked.join(",")}`,
    );
  };

  return (
    <div>
      <RaffleNumberGrid
        count={numberCount}
        states={states}
        selected={selected}
        onToggle={toggle}
      />
      <RaffleNumberLegend />

      {/* "Números tomados" tray — the staging area before checkout. */}
      <div className="mt-6 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            Números tomados ({picked.length})
          </h3>
          {picked.length > 0 && (
            <p className="text-sm text-muted">
              Total:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(total, currency)}
              </span>
            </p>
          )}
        </div>

        {picked.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Toca los números disponibles para apartarlos. {formatMoney(pricePerNumber, currency)}{" "}
            cada uno.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {picked.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => toggle(n)}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-sm font-semibold tabular-nums text-white"
                  aria-label={`Quitar el número ${String(n).padStart(2, "0")}`}
                >
                  {String(n).padStart(2, "0")}
                  <span aria-hidden className="text-white/80">
                    ✕
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!verified ? (
          <div className="mt-4 flex items-start gap-2 text-sm text-warning">
            <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              Vas a poder comprar números en cuanto el equipo de escuelaplace
              verifique a la escuela y publique sus medios de pago.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={buy}
              disabled={picked.length === 0}
              className="btn btn-primary justify-center px-8 py-3 text-base font-semibold"
            >
              Comprar {picked.length > 0 ? `(${picked.length})` : ""}
            </button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          {!verified
            ? "Para comprar, inicia sesión con Google. El pago va directo a la escuela por los medios que ella publica; escuelaplace nunca procesa pagos."
            : user
              ? "El 100% de tu aporte va directo a la escuela. La plataforma nunca toca el dinero."
              : "Inicia sesión con Google para comprar. El 100% de tu aporte va directo a la escuela. La plataforma nunca toca el dinero."}
        </p>
      </div>
    </div>
  );
}
