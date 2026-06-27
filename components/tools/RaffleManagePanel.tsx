"use client";

/**
 * The rifa control panel body, rendered by tools/[toolId]/manage once the dispatcher has loaded the
 * school + tool and checked that the viewer manages the school. It's the at-a-glance cockpit for ONE
 * raffle: a read-only config recap, the headline tallies (vendidos / reservados / disponibles + the
 * informational money figures), the full number grid, and a pending-orders queue the board can
 * confirm inline — so the board follows and runs the raffle WITHOUT entering the editor (and the
 * risks that carries). Editing lives behind the explicit "Editar rifa" button on the title row.
 *
 * PURELY INFORMATIONAL — the platform never processes money. The money figures are simply
 * numbers × the price the school set; the buyer pays the school directly and the school confirms.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  RaffleNumberGrid,
  RaffleNumberLegend,
} from "@/components/tools/RaffleNumberGrid";
import { ToolManageHeading } from "@/components/tools/ToolManageHeading";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { cardClass } from "@/components/ui/Card";
import { userErrorMessage } from "@/lib/errors";
import { formatDate, formatMoney } from "@/lib/format";
import {
  confirmRaffleOrder,
  getRaffleOrderProofUrl,
  getRaffleOrdersBySchool,
  raffleNumberStates,
  toolConfigOf,
} from "@/lib/firestore";
import type { RaffleOrderDoc, SchoolDoc, ToolDoc } from "@/types";

/** Format a list of raffle numbers as a comma-joined, zero-padded "N° 03, 17, 42". */
function numbersLabel(numbers: number[]): string {
  return numbers.map((n) => String(n).padStart(2, "0")).join(", ");
}

export function RaffleManagePanel({
  schoolId,
  school,
  tool,
}: {
  schoolId: string;
  school: SchoolDoc;
  tool: ToolDoc;
}) {
  const toolId = tool.id;
  const { user } = useAuth();
  const raffle = toolConfigOf(tool, "raffle")!;

  // All raffle orders this school owns, with private buyerName/amount merged (the board is
  // authorized to read them); we keep only this tool's. Null until the first load resolves.
  const [orders, setOrders] = useState<RaffleOrderDoc[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    getRaffleOrdersBySchool(schoolId)
      .then((all) => {
        setOrders(all.filter((o) => o.toolId === toolId));
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [schoolId, toolId]);

  useEffect(load, [load]);

  const editHref = `/panel/school/${schoolId}/tools/${toolId}`;
  const heading = (
    <ToolManageHeading
      backHref={`/panel/school/${schoolId}/tools/manage/raffle`}
      backLabel="Volver a rifas"
      title={tool.title}
      subtitle={`Gestión de la rifa · ${school.name}`}
      action={
        <Link href={editHref} className="btn btn-outline shrink-0">
          Editar rifa
        </Link>
      }
    />
  );

  // Derived tallies — recomputed whenever the orders change. The number grid drives the counts
  // (a confirmed order SELLS its numbers, a pending one RESERVES them); the money figures are just
  // those counts × the price the school set, never a sum the platform processes.
  const derived = useMemo(() => {
    const list = orders ?? [];
    const states = raffleNumberStates(list, raffle.numberCount);
    const sold = states.filter((s) => s === "sold").length;
    const reserved = states.filter((s) => s === "reserved").length;
    const available = raffle.numberCount - sold - reserved;
    const pending = list
      .filter((o) => o.status === "pending")
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
    return {
      states,
      sold,
      reserved,
      available,
      pending,
      raised: sold * raffle.pricePerNumber,
      reservedValue: reserved * raffle.pricePerNumber,
    };
  }, [orders, raffle.numberCount, raffle.pricePerNumber]);

  const confirmOne = async (order: RaffleOrderDoc) => {
    if (!user) return;
    setBusyId(order.id);
    setActionError(null);
    setStatus(null);
    try {
      await confirmRaffleOrder(order.id, user.id);
      load();
      setStatus("Pedido confirmado.");
    } catch (err) {
      setActionError(userErrorMessage(err, "No se pudo confirmar el pedido."));
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (order: RaffleOrderDoc) => {
    setActionError(null);
    const url = await getRaffleOrderProofUrl(order.id);
    if (!url) {
      setActionError("No se pudo abrir el comprobante.");
      return;
    }
    const win = window.open(url, "_blank", "noopener");
    if (!win) setActionError("No se pudo abrir el comprobante.");
  };

  return (
    <main>
      {heading}

      {/* Read-only configuration recap: the board sees the setup at a glance WITHOUT entering the
          editor — reinforcing that this panel is for following the rifa, not changing it. */}
      <section className={`mt-8 ${cardClass("inset")}`}>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Configuración
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Precio por número</dt>
            <dd className="text-foreground">
              {formatMoney(raffle.pricePerNumber, raffle.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Sorteo</dt>
            <dd className="text-foreground">
              {raffle.drawDate ? formatDate(raffle.drawDate.toMillis()) : "Sin definir"}
            </dd>
          </div>
          {raffle.drawMethod && (
            <div>
              <dt className="text-xs text-muted">Modalidad</dt>
              <dd className="text-foreground">{raffle.drawMethod}</dd>
            </div>
          )}
          {raffle.prizes.length > 0 && (
            <div>
              <dt className="text-xs text-muted">Premios</dt>
              <dd className="text-foreground">
                <ol className="list-inside list-decimal">
                  {raffle.prizes.map((prize, i) => (
                    <li key={i}>{prize}</li>
                  ))}
                </ol>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Headline tallies. The money figures are numbers × price — informational, never processed. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Cómo va la rifa
        </h2>
        <p className="mt-1 text-sm text-muted">
          escuelaplace solo muestra los montos (números × precio); nunca procesa el dinero.
        </p>
        {loadError ? (
          <div className="mt-4">
            <p role="alert" className="text-sm text-error">
              No pudimos cargar los pedidos. Revisa tu conexión e intenta de nuevo.
            </p>
            <button type="button" onClick={load} className="btn btn-outline mt-3">
              Reintentar
            </button>
          </div>
        ) : orders === null ? (
          <div
            className="mt-4 h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
            aria-hidden="true"
          />
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Vendidos"
              value={`${derived.sold} / ${raffle.numberCount}`}
              hint={`${formatMoney(derived.raised, raffle.currency)} confirmados`}
              tone="success"
            />
            <Stat
              label="Reservados"
              value={`${derived.reserved}`}
              hint={`${formatMoney(derived.reservedValue, raffle.currency)} por confirmar`}
              tone="warning"
            />
            <Stat
              label="Disponibles"
              value={`${derived.available}`}
              hint="aún sin reservar"
            />
          </dl>
        )}
      </section>

      {/* Pending-orders queue: confirm each reservation inline (mirrors the Actividad inbox row),
          without leaving the panel. The buyer's name + amount come from the private subdoc. */}
      {orders !== null && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Pedidos por confirmar ({derived.pending.length})
            </h2>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {status}
          </p>
          {actionError && (
            <p role="alert" className="mt-3 text-sm text-error">
              {actionError}
            </p>
          )}
          {derived.pending.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No hay reservas pendientes. Las nuevas reservas aparecerán acá para que las
              confirmes.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {derived.pending.map((order) => (
                <li
                  key={order.id}
                  className={`${cardClass("elevated")} flex items-center justify-between gap-3 text-sm`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold tracking-tight text-foreground">
                      {order.buyerName || "Sin nombre"}
                    </p>
                    <p className="text-muted">
                      N° {numbersLabel(order.numbers)}
                      {" · "}
                      {formatMoney(
                        order.amount ?? order.numbers.length * raffle.pricePerNumber,
                        order.currency,
                      )}
                    </p>
                    {order.proofUploaded ? (
                      <button
                        type="button"
                        onClick={() => viewProof(order)}
                        className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-brand-darker underline"
                      >
                        Ver comprobante
                      </button>
                    ) : (
                      <span className="mt-1 block text-xs text-muted">Sin comprobante</span>
                    )}
                    <PendingAge since={order.createdAt} />
                  </div>
                  <button
                    type="button"
                    onClick={() => confirmOne(order)}
                    disabled={busyId !== null}
                    className="btn btn-primary shrink-0"
                  >
                    {busyId === order.id ? "Confirmando…" : "Confirmar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* The full board: which numbers are sold / reserved / available, at a glance. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tablero de números
        </h2>
        <div className="mt-4">
          <RaffleNumberGrid count={raffle.numberCount} states={derived.states} />
          <RaffleNumberLegend />
        </div>
      </section>

      {/* Quick links to the surfaces this panel doesn't own. */}
      <section className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6">
        <Link
          href={`/panel/school/${schoolId}/raffle-orders`}
          className="btn btn-outline"
        >
          Confirmar compras
        </Link>
        <Link href={`/school/${schoolId}/tool/${toolId}`} className="btn btn-outline">
          Ver página pública
        </Link>
      </section>
    </main>
  );
}

/** A single headline tally cell: big number + label + a faint hint line below. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "warning";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className={cardClass("inset")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </dd>
      <p className="mt-1 text-xs tabular-nums text-muted">{hint}</p>
    </div>
  );
}
