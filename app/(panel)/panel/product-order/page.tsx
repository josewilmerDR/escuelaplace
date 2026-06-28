"use client";

/**
 * Product buy flow (/panel/product-order?schoolId=&toolId=&productId=).
 *
 * A signed-in buyer orders one product from a school "Productos" catalog. Mirrors the raffle /
 * donation flow: reveal the school's VERIFIED payment methods, choose a quantity, attach the
 * proof, create a PENDING order — the school confirms the payment on its side. The platform
 * never processes the money. The product is re-resolved here from the live catalog (it may have
 * been edited/removed since the page that linked here was loaded).
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { UNVERIFIED_DONATION_TEXT } from "@/components/school/UnverifiedSchoolNotice";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormError } from "@/components/ui/FormError";
import { userErrorMessage } from "@/lib/errors";
import {
  createProductOrder,
  getToolById,
  getVerifiedSchoolPaymentMethods,
  toolConfigOf,
  uploadProductOrderProof,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import { PRODUCT_ORDER_QTY_MAX } from "@/types";
import type { PaymentMethod, SaleProduct, ToolDoc } from "@/types";

export default function ProductOrderPage() {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <ProductOrderContent />
    </Suspense>
  );
}

function OrderSkeleton() {
  return (
    <main>
      <PageTitle title="Comprar" />
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </div>
      <p className="sr-only" role="status">
        Cargando…
      </p>
    </main>
  );
}

function ProductOrderContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const toolId = params.get("toolId") ?? "";
  const productId = params.get("productId") ?? "";

  const [tool, setTool] = useState<ToolDoc | null>(null);
  // The resolved product from the live catalog, or null if it no longer exists.
  const [product, setProduct] = useState<SaleProduct | null>(null);
  // null = school not verified (payment data hidden); [] = verified but none published.
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [quantity, setQuantity] = useState(1);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; quantity: number } | null>(
    null,
  );
  // After the order is created we keep its id so the buyer can (re)upload the proof from the
  // success screen — the proof upload is best-effort, so a skip or a failure is recoverable.
  const [orderId, setOrderId] = useState<string | null>(null);
  const [proofUploaded, setProofUploaded] = useState(false);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const lookup =
      schoolId && toolId
        ? Promise.all([
            getToolById(schoolId, toolId),
            getVerifiedSchoolPaymentMethods(schoolId),
          ])
        : Promise.resolve(null);
    lookup
      .then((res) => {
        if (cancelled || !res) return;
        const [t, m] = res;
        setTool(t);
        setMethods(m);
        const found =
          toolConfigOf(t, "sale")?.products.find((p) => p.id === productId) ??
          null;
        setProduct(found);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, toolId, productId]);

  if (!user || !loaded) return <OrderSkeleton />;

  const sale = toolConfigOf(tool, "sale");
  const invalid = !tool || tool.type !== "sale" || !sale || !product;
  const currency = sale?.currency ?? "CRC";
  const qty = Number.isInteger(quantity)
    ? Math.min(Math.max(quantity, 1), PRODUCT_ORDER_QTY_MAX)
    : 1;
  const total = product ? qty * product.price : 0;
  // Buying needs a verified school (methods !== null) and an existing product.
  const canBuy = !invalid && methods !== null && !done;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBuy || !sale || !tool || !product) return;
    setSaving(true);
    setError(null);

    // Phase 1 — create the pending order. Only a failure here invalidates the action.
    let newId: string;
    try {
      newId = await createProductOrder({
        schoolId,
        schoolName: tool.schoolName,
        toolId,
        toolTitle: tool.title,
        buyerId: user.id,
        buyerName: user.name,
        productId: product.id,
        productName: product.name,
        quantity: qty,
        amount: total,
        currency,
      });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar tu compra."));
      setSaving(false);
      return;
    }

    // Phase 2 — best-effort proof upload (a failure must NOT invalidate the order). On a skip or
    // failure the success screen offers a re-upload against this order id.
    setOrderId(newId);
    const file = proofFile;
    setProofFile(null);
    if (file) {
      try {
        await uploadProductOrderProof(newId, file);
        setProofUploaded(true);
      } catch {
        setProofUploaded(false);
      }
    }
    setDone({ name: product.name, quantity: qty });
    setSaving(false);
  };

  const onRetryProof = async () => {
    if (!orderId || !retryFile) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await uploadProductOrderProof(orderId, retryFile);
      setRetryFile(null);
      setProofUploaded(true);
    } catch (err) {
      setRetryError(userErrorMessage(err, "No se pudo subir el comprobante."));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <main>
      <div className="text-sm">
        <BackLink href={schoolId && toolId ? `/school/${schoolId}/tool/${toolId}` : "/panel"}>
          {tool ? tool.title : "Volver"}
        </BackLink>
      </div>

      <PageTitle title="Comprar" className="mt-2" />

      {invalid ? (
        <p className="mt-4 text-sm text-muted">
          No encontramos este producto. Vuelve a la página de la escuela y elígelo
          de nuevo.
        </p>
      ) : done ? (
        <div className="mt-6">
          <p
            role="status"
            className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10"
          >
            ¡Listo! Pediste {done.quantity}{" "}
            {done.quantity === 1 ? "unidad" : "unidades"} de «{done.name}». La
            escuela confirmará tu pago.
          </p>

          {proofUploaded ? (
            <p className="mt-4 text-sm text-success">
              Comprobante enviado. La escuela lo revisará.
            </p>
          ) : (
            <div className={`mt-4 ${cardClass("inset")}`}>
              <p className="text-sm text-muted">
                Si ya pagaste, sube tu comprobante para que la escuela confirme tu
                compra.
              </p>
              <div className="mt-2">
                <FilePicker
                  label="Comprobante de pago"
                  hint="No se publica; la escuela lo usa para confirmar."
                  value={retryFile}
                  onChange={setRetryFile}
                />
              </div>
              {retryError && (
                <p role="alert" className="mt-1 text-sm text-error">
                  {retryError}
                </p>
              )}
              <button
                type="button"
                onClick={onRetryProof}
                disabled={!retryFile || retrying}
                className="btn btn-primary mt-3"
              >
                {retrying ? "Subiendo…" : "Subir comprobante"}
              </button>
            </div>
          )}

          <p className="mt-4 text-sm">
            <Link
              href={`/school/${schoolId}/tool/${toolId}`}
              className="font-medium text-brand-darker hover:underline"
            >
              Volver a los productos
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className={`text-sm ${cardClass("inset")}`}>
            <p className="font-medium text-foreground">{product!.name}</p>
            <p className="mt-1 text-muted">
              {formatMoney(product!.price, currency)} c/u
            </p>

            <label className="mt-3 flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Cantidad</span>
              <input
                type="number"
                min={1}
                max={PRODUCT_ORDER_QTY_MAX}
                step={1}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setQuantity(
                    Number.isFinite(n)
                      ? Math.min(Math.max(n, 1), PRODUCT_ORDER_QTY_MAX)
                      : 1,
                  );
                }}
                className="input w-24"
              />
            </label>

            <p className="mt-3 text-muted">
              {qty} ×{" "}
              {formatMoney(product!.price, currency)} ={" "}
              <span className="font-semibold text-foreground">
                {formatMoney(total, currency)}
              </span>
            </p>
          </div>

          <div className={`text-sm ${cardClass("inset")}`}>
            <PaymentMethodsInfo
              methods={methods}
              unverifiedText={UNVERIFIED_DONATION_TEXT}
            />
          </div>

          <FilePicker
            label="Comprobante de pago (opcional)"
            hint="No se publica; la escuela lo usa para confirmar tu compra."
            value={proofFile}
            onChange={setProofFile}
            disabled={methods === null}
          />

          <FormError message={error} />

          <button
            type="submit"
            disabled={!canBuy || saving}
            aria-busy={saving}
            className="btn btn-primary"
          >
            {saving ? "Registrando…" : "Confirmar compra"}
          </button>
          <p className="text-xs text-muted">
            Pagas directo a la escuela por los medios de arriba; escuelaplace nunca
            procesa pagos.
          </p>
        </form>
      )}
    </main>
  );
}
