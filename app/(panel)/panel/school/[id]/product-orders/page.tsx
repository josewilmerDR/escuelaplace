"use client";

/**
 * Product order confirmation queue (/panel/school/[id]/product-orders).
 *
 * The board reviews the product orders people placed across its "Productos" catalogs, opens each
 * payment proof, and confirms — which flips the order to 'confirmed'. Mirrors the raffle-orders /
 * subscriptions / project-contributions queues. The platform never touches the money; confirming
 * only records that the school received the payment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import {
  confirmProductOrder,
  getProductOrderProofUrl,
  getProductOrdersBySchool,
  getSchoolById,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type { ProductOrderDoc, SchoolDoc } from "@/types";

type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando pedidos…";

function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Pedidos
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
  order: ProductOrderDoc;
  busy: boolean;
  onConfirm?: (id: string) => void;
  onViewProof: (id: string) => void;
}) {
  const isPending = order.status === "pending";
  return (
    <li className={cardClass("elevated", false) + " p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold tracking-tight text-foreground">
            {order.quantity} × {order.productName}
          </p>
          <p className="text-sm text-muted">
            {order.buyerName ?? "Comprador"} ·{" "}
            {order.amount != null
              ? formatMoney(order.amount, order.currency)
              : "—"}
          </p>
          <p className="text-xs text-muted">{order.toolTitle}</p>
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
            onClick={() => onConfirm(order.id)}
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

export default function SchoolProductOrdersPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [orders, setOrders] = useState<ProductOrderDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    return getProductOrdersBySchool(id).then(setOrders);
  }, [id]);

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getProductOrdersBySchool(id)])
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

  const confirmOne = async (orderId: string) => {
    if (!user) return;
    setBusyId(orderId);
    setError(null);
    setStatus(null);
    try {
      await confirmProductOrder(orderId, user.id);
      await reload();
      setStatus("Pedido confirmado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmAll = async () => {
    if (!user || pending.length === 0) return;
    setBusyId("all");
    setError(null);
    setStatus(null);
    const total = pending.length;
    try {
      const results = await Promise.allSettled(
        pending.map((o) => confirmProductOrder(o.id, user.id)),
      );
      await reload();
      const failed = results.filter((r) => r.status === "rejected").length;
      setError(
        failed > 0
          ? `No se pudieron confirmar ${failed} de ${total} pedidos.`
          : null,
      );
      if (failed === 0) setStatus(`${total} pedidos confirmados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (orderId: string) => {
    setError(null);
    const url = await getProductOrderProofUrl(orderId);
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

      <SchoolPanelNav schoolId={id} current="product-orders" />

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Pendientes ({pending.length})
          </h2>
          {pending.length > 1 && (
            <button
              type="button"
              onClick={confirmAll}
              disabled={busyId !== null}
              className="btn btn-outline"
            >
              {busyId === "all" ? "Confirmando…" : "Confirmar todos"}
            </button>
          )}
        </div>
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
                busy={busyId === o.id || busyId === "all"}
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
