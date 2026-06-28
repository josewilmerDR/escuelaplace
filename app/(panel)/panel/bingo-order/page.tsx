"use client";

/**
 * Bingo buy flow (/panel/bingo-order?schoolId=&toolId=).
 *
 * A signed-in buyer reserves N cartones from a school bingo. Mirrors the product/raffle flow:
 * reveal the school's VERIFIED payment methods, choose how many cartones, attach the proof, create
 * a PENDING order — the school confirms the payment AND assigns the specific cartones on its side
 * (the buyer reserves a quantity, not specific cartones). The platform never processes the money.
 * The available count is re-resolved here from the live lote + orders.
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
  createBingoOrder,
  getBingoCardAvailability,
  getBingoCards,
  getBingoOrdersByTool,
  getToolById,
  getVerifiedSchoolPaymentMethods,
  toolConfigOf,
  uploadBingoOrderProof,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import { BINGO_ORDER_QTY_MAX } from "@/types";
import type { PaymentMethod, ToolDoc } from "@/types";

export default function BingoOrderPage() {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <BingoOrderContent />
    </Suspense>
  );
}

function OrderSkeleton() {
  return (
    <main>
      <PageTitle title="Comprar cartones" />
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

function BingoOrderContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const toolId = params.get("toolId") ?? "";

  const [tool, setTool] = useState<ToolDoc | null>(null);
  // null = school not verified (payment data hidden); [] = verified but none published.
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [available, setAvailable] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [quantity, setQuantity] = useState(1);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ quantity: number } | null>(null);
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
            getBingoCards(schoolId, toolId),
            getBingoOrdersByTool(toolId),
          ])
        : Promise.resolve(null);
    lookup
      .then((res) => {
        if (cancelled || !res) return;
        const [t, m, cards, orders] = res;
        setTool(t);
        setMethods(m);
        setAvailable(getBingoCardAvailability(cards, orders).available);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, toolId]);

  if (!user || !loaded) return <OrderSkeleton />;

  const bingo = toolConfigOf(tool, "bingo");
  const invalid = !tool || tool.type !== "bingo" || !bingo || available <= 0;
  const currency = bingo?.currency ?? "CRC";
  // The reservable max is the smaller of the per-order cap and what's still available.
  const maxQty = Math.min(BINGO_ORDER_QTY_MAX, Math.max(available, 1));
  const qty = Number.isInteger(quantity)
    ? Math.min(Math.max(quantity, 1), maxQty)
    : 1;
  const total = bingo ? qty * bingo.pricePerCard : 0;
  // Buying needs a verified school (methods !== null) and at least one available cartón.
  const canBuy = !invalid && methods !== null && !done;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBuy || !bingo || !tool) return;
    setSaving(true);
    setError(null);

    // Phase 1 — create the pending order. Only a failure here invalidates the action.
    let newId: string;
    try {
      newId = await createBingoOrder({
        schoolId,
        schoolName: tool.schoolName,
        toolId,
        toolTitle: tool.title,
        buyerId: user.id,
        buyerName: user.name,
        quantity: qty,
        amount: total,
        currency,
      });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar tu compra."));
      setSaving(false);
      return;
    }

    // Phase 2 — best-effort proof upload (a failure must NOT invalidate the order).
    setOrderId(newId);
    const file = proofFile;
    setProofFile(null);
    if (file) {
      try {
        await uploadBingoOrderProof(newId, file);
        setProofUploaded(true);
      } catch {
        setProofUploaded(false);
      }
    }
    setDone({ quantity: qty });
    setSaving(false);
  };

  const onRetryProof = async () => {
    if (!orderId || !retryFile) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await uploadBingoOrderProof(orderId, retryFile);
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
        <BackLink
          href={schoolId && toolId ? `/school/${schoolId}/tool/${toolId}` : "/panel"}
        >
          {tool ? tool.title : "Volver"}
        </BackLink>
      </div>

      <PageTitle title="Comprar cartones" className="mt-2" />

      {invalid ? (
        <p className="mt-4 text-sm text-muted">
          No hay cartones disponibles para este bingo. Vuelve a la página de la
          escuela.
        </p>
      ) : done ? (
        <div className="mt-6">
          <p
            role="status"
            className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10"
          >
            ¡Listo! Reservaste {done.quantity}{" "}
            {done.quantity === 1 ? "cartón" : "cartones"}. La escuela confirmará tu
            pago y te asignará los cartones.
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
              Volver al bingo
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className={`text-sm ${cardClass("inset")}`}>
            <p className="font-medium text-foreground">{tool!.title}</p>
            <p className="mt-1 text-muted">
              {formatMoney(bingo!.pricePerCard, currency)} por cartón · {available}{" "}
              disponibles
            </p>

            <label className="mt-3 flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Cantidad</span>
              <input
                type="number"
                min={1}
                max={maxQty}
                step={1}
                inputMode="numeric"
                // Allow an empty display while editing (don't snap to 1 on backspace); `qty`
                // keeps the total valid and submit uses it, and onBlur normalizes back into range.
                value={quantity || ""}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setQuantity(
                    Number.isFinite(n) ? Math.min(Math.max(n, 0), maxQty) : 0,
                  );
                }}
                onBlur={() =>
                  setQuantity((q) =>
                    Math.min(Math.max(Math.floor(q) || 1, 1), maxQty),
                  )
                }
                className="input w-24 no-spinner"
              />
            </label>

            <p className="mt-3 text-muted">
              {qty} × {formatMoney(bingo!.pricePerCard, currency)} ={" "}
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
