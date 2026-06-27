"use client";

/**
 * The "Productos" (sale) control panel body, rendered by tools/[toolId]/manage once the dispatcher
 * has loaded the school + tool and checked that the viewer manages the school. It's the at-a-glance
 * cockpit for ONE product catalog: a read-only config recap, the order tallies (pedidos confirmados /
 * unidades / recaudado — informational), and a pending-orders queue the board can confirm inline — so
 * the board follows and runs the sale WITHOUT entering the editor. Editing lives behind the explicit
 * "Editar productos" button on the title row.
 *
 * PURELY INFORMATIONAL — the platform never processes money. The buyer pays the school directly by
 * the methods it publishes; the school confirms the proof, same as donations. Products are unlimited
 * (unlike a raffle's numbers), so there is no inventory tally — only the order queue.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { ManageStat as Stat } from "@/components/tools/ManageStat";
import { ToolManageHeading } from "@/components/tools/ToolManageHeading";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { cardClass } from "@/components/ui/Card";
import { userErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import {
  confirmProductOrder,
  getProductOrderProofUrl,
  getProductOrdersBySchool,
  toolConfigOf,
} from "@/lib/firestore";
import type { ProductOrderDoc, SchoolDoc, ToolDoc } from "@/types";

export function SaleManagePanel({
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
  const sale = toolConfigOf(tool, "sale")!;
  // A "Productos" tool is a single product: its name/description are the tool's own
  // title/description, so the recap reads the product's price/media from the first catalog entry.
  const product = sale.products[0];

  // Every product order targeting this school, with the private buyerName/amount merged (the board
  // is authorized to read them); we keep only this tool's. Null until the first load resolves.
  const [orders, setOrders] = useState<ProductOrderDoc[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    getProductOrdersBySchool(schoolId)
      .then((all) => {
        setOrders(all.filter((o) => o.toolId === toolId));
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [schoolId, toolId]);

  useEffect(load, [load]);

  const editHref = `/panel/school/${schoolId}/tools/${toolId}`;

  const unitPrice = product?.price ?? 0;

  // Derived tallies — confirmed orders feed the money/units figures (informational), pending feed
  // the inline queue. The amount comes from the private subdoc; we fall back to quantity × price.
  // Computed inline (no useMemo): the React Compiler memoizes, and a manual dep tracing back to the
  // array element `sale.products[0]` isn't preserved by it.
  const orderList = orders ?? [];
  const confirmedOrders = orderList.filter((o) => o.status === "confirmed");
  const derived = {
    confirmedCount: confirmedOrders.length,
    pending: orderList
      .filter((o) => o.status === "pending")
      .sort(
        (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0),
      ),
    units: confirmedOrders.reduce((sum, o) => sum + (o.quantity || 0), 0),
    raised: confirmedOrders.reduce(
      (sum, o) => sum + (o.amount ?? o.quantity * unitPrice),
      0,
    ),
  };

  const confirmOne = async (order: ProductOrderDoc) => {
    if (!user) return;
    setBusyId(order.id);
    setActionError(null);
    setStatus(null);
    try {
      await confirmProductOrder(order.id, user.id);
      load();
      setStatus("Pedido confirmado.");
    } catch (err) {
      setActionError(userErrorMessage(err, "No se pudo confirmar el pedido."));
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (order: ProductOrderDoc) => {
    setActionError(null);
    const url = await getProductOrderProofUrl(order.id);
    if (!url) {
      setActionError("No se pudo abrir el comprobante.");
      return;
    }
    const win = window.open(url, "_blank", "noopener");
    if (!win) setActionError("No se pudo abrir el comprobante.");
  };

  const photoCount = product?.photos?.length ?? 0;

  return (
    <main>
      <ToolManageHeading
        backHref={`/panel/school/${schoolId}/tools/manage/sale`}
        backLabel="Volver a productos"
        title={tool.title}
        subtitle={`Gestión del producto · ${school.name}`}
        action={
          <Link href={editHref} className="btn btn-outline shrink-0">
            Editar producto
          </Link>
        }
      />

      {/* Read-only configuration recap: the board sees the setup at a glance WITHOUT entering the
          editor — reinforcing that this panel is for following the sale, not changing it. */}
      <section className={`mt-8 ${cardClass("inset")}`}>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Configuración
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {product && (
            <div>
              <dt className="text-xs text-muted">Precio</dt>
              <dd className="text-foreground">
                {formatMoney(product.price, sale.currency)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Fotos</dt>
            <dd className="text-foreground">
              {photoCount > 0
                ? `${photoCount} ${photoCount === 1 ? "foto" : "fotos"}`
                : "Sin fotos"}
              {product?.videoUrl ? " · 1 video" : ""}
            </dd>
          </div>
        </dl>
      </section>

      {/* Headline tallies. The money figure is the confirmed orders' amounts — informational. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Cómo va la venta
        </h2>
        <p className="mt-1 text-sm text-muted">
          escuelaplace solo muestra los pedidos y montos confirmados; nunca procesa el dinero.
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
              label="Pedidos confirmados"
              value={`${derived.confirmedCount}`}
              hint={`${derived.pending.length} por confirmar`}
              tone="success"
            />
            <Stat label="Unidades" value={`${derived.units}`} hint="confirmadas" />
            <Stat
              label="Recaudado"
              value={formatMoney(derived.raised, sale.currency)}
              hint="confirmado"
              tone="success"
            />
          </dl>
        )}
      </section>

      {/* Pending-orders queue: confirm each order inline (mirrors the Actividad inbox row), without
          leaving the panel. The buyer's name + amount come from the private subdoc. */}
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
              No hay pedidos pendientes. Los nuevos pedidos aparecerán acá para que los confirmes.
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
                      {order.quantity} × {order.productName}
                      {" · "}
                      {formatMoney(
                        order.amount ?? order.quantity * unitPrice,
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
          href={`/panel/school/${schoolId}/activity?filter=product_order`}
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
