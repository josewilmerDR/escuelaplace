"use client";

/**
 * The bingo control panel body, rendered by tools/[toolId]/manage once the dispatcher has loaded the
 * school + tool and checked that the viewer manages the school. It's the at-a-glance cockpit for ONE
 * bingo: a read-only config recap, the cartón tallies (vendidos / reservados / disponibles), the LIVE
 * game status (subscribed in real time) with the prominent "Dirigir en vivo" entry point, and a
 * pending-orders queue the board can confirm inline (which assigns cartones) — so the board follows
 * and runs the bingo WITHOUT entering the editor. Editing lives behind the explicit "Editar bingo"
 * button on the title row; the cartones live in reusable mazos, linked at the foot.
 *
 * PURELY INFORMATIONAL — the platform never processes money. The money figures are simply cartones ×
 * the price the school set; the buyer pays the school directly and the school confirms.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { ToolManageHeading } from "@/components/tools/ToolManageHeading";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { userErrorMessage } from "@/lib/errors";
import { formatDate, formatMoney } from "@/lib/format";
import {
  confirmBingoOrder,
  getBingoCardAvailability,
  getBingoCards,
  getBingoOrderProofUrl,
  getBingoOrdersBySchool,
  subscribeBingoEventState,
  toolConfigOf,
} from "@/lib/firestore";
import type {
  BingoCardDoc,
  BingoEventState,
  BingoOrderDoc,
  SchoolDoc,
  ToolDoc,
} from "@/types";

/** Spanish label + tone for the live-event status (null = the board never started a game). */
function liveStatus(state: BingoEventState | null): {
  label: string;
  tone: "neutral" | "success" | "warning" | "info";
} {
  if (!state) return { label: "Sin iniciar", tone: "neutral" };
  if (state.pause) return { label: "En pausa", tone: "warning" };
  switch (state.status) {
    case "live":
      return { label: "En vivo", tone: "success" };
    case "closed":
      return { label: "Cerrado", tone: "neutral" };
    default:
      return { label: "En preparación", tone: "info" };
  }
}

export function BingoManagePanel({
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
  const bingo = toolConfigOf(tool, "bingo")!;

  // The cartones (lote) + every order of this bingo, with the private buyerName/amount merged (the
  // board is authorized to read them). Null until the first load resolves.
  const [cards, setCards] = useState<BingoCardDoc[] | null>(null);
  const [orders, setOrders] = useState<BingoOrderDoc[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // The live-event state, kept in real time so the board sees "En vivo" / bolas cantadas without a
  // reload. Starts undefined (not yet subscribed) → null (no game) or a state.
  const [live, setLive] = useState<BingoEventState | null>(null);

  const load = useCallback(() => {
    // getBingoOrdersBySchool (NOT …ByTool) merges the private buyerName/amount the queue shows.
    Promise.all([
      getBingoCards(schoolId, toolId),
      getBingoOrdersBySchool(schoolId),
    ])
      .then(([allCards, allOrders]) => {
        setCards(allCards);
        setOrders(allOrders.filter((o) => o.toolId === toolId));
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [schoolId, toolId]);

  useEffect(load, [load]);

  // Live game status: subscribe so the cockpit reflects the director in real time. The subscription
  // fires immediately with the current value (or null before any game), so no separate seed read.
  useEffect(() => {
    const unsubscribe = subscribeBingoEventState(schoolId, toolId, setLive);
    return () => unsubscribe();
  }, [schoolId, toolId]);

  const editHref = `/panel/school/${schoolId}/tools/${toolId}`;

  // Derived tallies — cartones state + the pending queue, recomputed whenever cards/orders change.
  const derived = useMemo(() => {
    const cardList = cards ?? [];
    const orderList = orders ?? [];
    const availability = getBingoCardAvailability(cardList, orderList);
    const pending = orderList
      .filter((o) => o.status === "pending")
      .sort(
        (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0),
      );
    return {
      availability,
      pending,
      raised: availability.sold * bingo.pricePerCard,
    };
  }, [cards, orders, bingo.pricePerCard]);

  const confirmOne = async (order: BingoOrderDoc) => {
    if (!user) return;
    setBusyId(order.id);
    setActionError(null);
    setStatus(null);
    try {
      // confirmBingoOrder takes the ORDER OBJECT (it assigns cartones) and THROWS if fewer are
      // available than requested — surface that so the board can generate more or adjust.
      await confirmBingoOrder(order, user.id);
      load();
      setStatus("Pedido confirmado y cartones asignados.");
    } catch (err) {
      setActionError(userErrorMessage(err, "No se pudo confirmar el pedido."));
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (order: BingoOrderDoc) => {
    setActionError(null);
    const url = await getBingoOrderProofUrl(order.id);
    if (!url) {
      setActionError("No se pudo abrir el comprobante.");
      return;
    }
    const win = window.open(url, "_blank", "noopener");
    if (!win) setActionError("No se pudo abrir el comprobante.");
  };

  const ready = cards !== null && orders !== null;
  const fmt = bingo.format;
  const live0 = liveStatus(live);

  return (
    <main>
      <ToolManageHeading
        backHref={`/panel/school/${schoolId}/tools/manage/bingo`}
        backLabel="Volver a bingos"
        title={tool.title}
        subtitle={`Gestión del bingo · ${school.name}`}
        action={
          <Link href={editHref} className="btn btn-outline shrink-0">
            Editar bingo
          </Link>
        }
      />

      {/* Read-only configuration recap: the board sees the setup at a glance WITHOUT entering the
          editor — reinforcing that this panel is for following the bingo, not changing it. */}
      <section className={`mt-8 ${cardClass("inset")}`}>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Configuración
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Precio por cartón</dt>
            <dd className="text-foreground">
              {formatMoney(bingo.pricePerCard, bingo.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Cartón</dt>
            <dd className="text-foreground">
              {fmt.rows}×{fmt.cols} · {fmt.poolMin}–{fmt.poolMax}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Evento</dt>
            <dd className="text-foreground">
              {bingo.eventDate ? formatDate(bingo.eventDate.toMillis()) : "Sin definir"}
            </dd>
          </div>
          {bingo.drawMethod && (
            <div>
              <dt className="text-xs text-muted">Modalidad</dt>
              <dd className="text-foreground">{bingo.drawMethod}</dd>
            </div>
          )}
          {bingo.prizes && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Premios</dt>
              <dd className="text-foreground">
                <ol className="list-inside list-decimal">
                  <li>{bingo.prizes.first}</li>
                  {bingo.prizes.second && <li>{bingo.prizes.second}</li>}
                  {bingo.prizes.third && <li>{bingo.prizes.third}</li>}
                  {(bingo.prizes.others ?? []).map((p, i) => (
                    <li key={`other-${i}`}>{p}</li>
                  ))}
                </ol>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Headline tallies. The money figure is cartones × price — informational, never processed. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Cómo va el bingo
        </h2>
        <p className="mt-1 text-sm text-muted">
          escuelaplace solo muestra los montos (cartones × precio); nunca procesa el dinero.
        </p>
        {loadError ? (
          <div className="mt-4">
            <p role="alert" className="text-sm text-error">
              No pudimos cargar los cartones. Revisa tu conexión e intenta de nuevo.
            </p>
            <button type="button" onClick={load} className="btn btn-outline mt-3">
              Reintentar
            </button>
          </div>
        ) : !ready ? (
          <div
            className="mt-4 h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
            aria-hidden="true"
          />
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Vendidos"
              value={`${derived.availability.sold} / ${derived.availability.total}`}
              hint={`${formatMoney(derived.raised, bingo.currency)} confirmados`}
              tone="success"
            />
            <Stat
              label="Reservados"
              value={`${derived.availability.pendingReserved}`}
              hint="por confirmar"
              tone="warning"
            />
            <Stat
              label="Disponibles"
              value={`${derived.availability.available}`}
              hint="aún sin reservar"
            />
          </dl>
        )}
      </section>

      {/* Live game: the real-time status + the entry point to the director console. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Bingo en vivo
        </h2>
        <p className="mt-1 text-sm text-muted">
          Dirige el juego: canta los números y valida los reclamos en tiempo real.
        </p>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-brand-tint p-4 ring-1 ring-brand/10">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2">
              <Badge tone={live0.tone}>{live0.label}</Badge>
              {live?.reviewing && <Badge tone="warning">Revisando reclamo</Badge>}
            </span>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="text-xs text-muted">Bolas cantadas</dt>
                <dd className="tabular-nums text-foreground">
                  {live?.calledNumbers?.length ?? 0}
                </dd>
              </div>
              {live?.activePrize && (
                <div>
                  <dt className="text-xs text-muted">Ronda actual</dt>
                  <dd className="text-foreground">{live.activePrize.label}</dd>
                </div>
              )}
              {live?.winner && (
                <div>
                  <dt className="text-xs text-muted">Último ganador</dt>
                  <dd className="text-foreground">
                    Cartón {live.winner.cardLabel} · {live.winner.prizeLabel}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <Link
            href={`/panel/school/${schoolId}/bingo-live?tool=${toolId}`}
            className="btn btn-primary shrink-0"
          >
            Dirigir en vivo
          </Link>
        </div>
      </section>

      {/* Pending-orders queue: confirm each reservation inline (assigns cartones to the buyer),
          without leaving the panel. The buyer's name + amount come from the private subdoc. */}
      {orders !== null && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Pedidos por confirmar ({derived.pending.length})
          </h2>
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
              confirmes (al confirmar se asignan los cartones).
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
                      {order.quantity}{" "}
                      {order.quantity === 1 ? "cartón" : "cartones"}
                      {" · "}
                      {formatMoney(
                        order.amount ?? order.quantity * bingo.pricePerCard,
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

      {/* Quick links to the surfaces this panel doesn't own. */}
      <section className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6">
        <Link
          href={`/panel/school/${schoolId}/bingo-decks`}
          className="btn btn-outline"
        >
          Mazos de bingo
        </Link>
        <Link
          href={`/panel/school/${schoolId}/activity?filter=bingo_order`}
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
