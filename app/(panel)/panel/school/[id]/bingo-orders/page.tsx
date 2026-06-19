"use client";

/**
 * Bingo order confirmation queue (/panel/school/[id]/bingo-orders).
 *
 * The board reviews the cartón orders people placed across its bingos, opens each payment proof,
 * and confirms — which flips the order to 'confirmed' AND assigns that many available cartones to
 * the buyer (confirmBingoOrder does both atomically, and throws if there aren't enough cartones).
 * Mirrors the product/raffle order queues. The platform never touches the money; confirming only
 * records that the school received the payment and hands over the cartones.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import {
  confirmBingoOrder,
  getBingoOrderProofUrl,
  getBingoOrdersBySchool,
  getSchoolById,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type { BingoOrderDoc, SchoolDoc } from "@/types";

type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando pedidos…";

function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Bingos
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

function OrderRow({
  order,
  busy,
  onConfirm,
  onViewProof,
}: {
  order: BingoOrderDoc;
  busy: boolean;
  onConfirm?: (order: BingoOrderDoc) => void;
  onViewProof: (id: string) => void;
}) {
  const isPending = order.status === "pending";
  const assigned = order.cardIds?.length ?? 0;
  return (
    <li className={cardClass("elevated", false) + " p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold tracking-tight text-foreground">
            {order.quantity}{" "}
            {order.quantity === 1 ? "cartón" : "cartones"}
          </p>
          <p className="text-sm text-muted">
            {order.buyerName ?? "Comprador"} ·{" "}
            {order.amount != null
              ? formatMoney(order.amount, order.currency)
              : "—"}
          </p>
          <p className="text-xs text-muted">{order.toolTitle}</p>
          {!isPending && assigned > 0 && (
            <p className="mt-1 text-xs text-muted">
              {assigned} {assigned === 1 ? "cartón asignado" : "cartones asignados"}
            </p>
          )}
        </div>
        {!isPending && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Confirmado
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm">
        {order.proofUploaded ? (
          <button
            type="button"
            onClick={() => onViewProof(order.id)}
            className="btn btn-outline"
          >
            Ver comprobante
          </button>
        ) : (
          <span className="text-muted">Sin comprobante</span>
        )}
        {isPending && onConfirm && (
          <button
            type="button"
            onClick={() => onConfirm(order)}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? "Confirmando…" : "Confirmar pago"}
          </button>
        )}
      </div>
    </li>
  );
}

export default function SchoolBingoOrdersPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [orders, setOrders] = useState<BingoOrderDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    return getBingoOrdersBySchool(id).then(setOrders);
  }, [id]);

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getBingoOrdersBySchool(id)])
      .then(([s, o]) => {
        setSchool(s);
        setOrders(o);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const pending = useMemo(
    () => orders.filter((o) => o.status === "pending"),
    [orders],
  );
  const confirmed = useMemo(
    () => orders.filter((o) => o.status !== "pending"),
    [orders],
  );

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading />
        <ul className="mt-8 flex flex-col gap-4" aria-hidden="true">
          <li className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </ul>
        <p className="sr-only" role="status">
          {LOADING_TEXT}
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los pedidos. Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <main>
        <Heading />
        <p className="mt-4 text-sm text-muted">Escuela no encontrada.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return (
      <main>
        <Heading subtitle={school.name} />
        <p className="mt-4 text-sm text-muted">No administrás esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const confirmOne = async (order: BingoOrderDoc) => {
    if (!user) return;
    setBusyId(order.id);
    setError(null);
    setStatus(null);
    try {
      await confirmBingoOrder(order, user.id);
      await reload();
      setStatus("Pedido confirmado y cartones asignados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (orderId: string) => {
    setError(null);
    const url = await getBingoOrderProofUrl(orderId);
    if (!url) {
      setError("No se pudo abrir el comprobante.");
      return;
    }
    const win = window.open(url, "_blank", "noopener");
    if (!win) setError("No se pudo abrir el comprobante.");
  };

  return (
    <main>
      <Heading subtitle={school.name} />

      <SchoolPanelNav schoolId={id} current="bingo-orders" />

      {status && (
        <p role="status" className="mt-4 text-sm text-success">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Pendientes ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No hay pedidos pendientes de confirmar.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {pending.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                busy={busyId === o.id}
                onConfirm={confirmOne}
                onViewProof={viewProof}
              />
            ))}
          </ul>
        )}
      </section>

      {confirmed.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Confirmados
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {confirmed.map((o) => (
              <OrderRow key={o.id} order={o} busy={false} onViewProof={viewProof} />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
