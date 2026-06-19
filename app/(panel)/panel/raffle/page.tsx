"use client";

/**
 * Raffle buy flow (/panel/raffle?schoolId=&toolId=&numbers=4,42).
 *
 * A signed-in buyer reserves the numbers they picked on the raffle's public page. Mirrors the
 * donation flow: reveal the school's VERIFIED payment methods, attach the proof, create a
 * PENDING order — the school confirms the payment on its side. The platform never processes
 * the money. Numbers already taken (since the page they came from was loaded) are re-checked
 * here and dropped with a notice before checkout.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { UNVERIFIED_DONATION_TEXT } from "@/components/school/UnverifiedSchoolNotice";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormError } from "@/components/ui/FormError";
import { userErrorMessage } from "@/lib/errors";
import {
  createRaffleOrder,
  getRaffleOrdersByTool,
  getToolById,
  getVerifiedSchoolPaymentMethods,
  raffleNumberStates,
  uploadRaffleOrderProof,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type { PaymentMethod, ToolDoc } from "@/types";

export default function RafflePage() {
  return (
    <Suspense fallback={<RaffleSkeleton />}>
      <RaffleContent />
    </Suspense>
  );
}

function RaffleSkeleton() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Comprar números
      </h1>
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

const fmt = (n: number) => String(n).padStart(2, "0");

function RaffleContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const toolId = params.get("toolId") ?? "";
  // Parse, dedupe and sort the requested numbers from the query (e.g. "4,42").
  const requested = useMemo(() => {
    const raw = params.get("numbers") ?? "";
    const set = new Set<number>();
    for (const part of raw.split(",")) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n >= 0) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  }, [params]);

  const [tool, setTool] = useState<ToolDoc | null>(null);
  // null = school not verified (payment data hidden); [] = verified but none published.
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  // Requested numbers that are still available (others were taken since selection).
  const [available, setAvailable] = useState<number[]>([]);
  const [taken, setTaken] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number[] | null>(null);
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
            getRaffleOrdersByTool(toolId),
          ])
        : Promise.resolve(null);
    lookup
      .then((res) => {
        if (cancelled || !res) return;
        const [t, m, orders] = res;
        setTool(t);
        setMethods(m);
        if (t?.raffle) {
          const states = raffleNumberStates(orders, t.raffle.numberCount);
          const avail: number[] = [];
          const gone: number[] = [];
          for (const n of requested) {
            if (n < t.raffle.numberCount && states[n] === "available") avail.push(n);
            else gone.push(n);
          }
          setAvailable(avail);
          setTaken(gone);
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, toolId, requested]);

  if (!user || !loaded) return <RaffleSkeleton />;

  const raffle = tool?.raffle;
  const invalid = !tool || tool.type !== "raffle" || !raffle;

  const total = raffle ? available.length * raffle.pricePerNumber : 0;
  // Buying needs a verified school (methods !== null) and at least one still-available number.
  const canBuy = !invalid && methods !== null && available.length > 0 && !done;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBuy || !raffle || !tool) return;
    setSaving(true);
    setError(null);

    // Phase 1 — create the pending order. Only a failure here invalidates the action.
    let newId: string;
    try {
      newId = await createRaffleOrder({
        schoolId,
        schoolName: tool.schoolName,
        toolId,
        toolTitle: tool.title,
        buyerId: user.id,
        buyerName: user.name,
        numbers: available,
        amount: total,
        currency: raffle.currency,
      });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar tu compra."));
      setSaving(false);
      return;
    }

    // Phase 2 — best-effort proof upload (a failure must NOT invalidate the order). On a skip
    // or failure the success screen offers a re-upload against this order id, so we don't show
    // a dead-end error here.
    setOrderId(newId);
    const file = proofFile;
    setProofFile(null);
    if (file) {
      try {
        await uploadRaffleOrderProof(newId, file);
        setProofUploaded(true);
      } catch {
        setProofUploaded(false);
      }
    }
    setDone(available);
    setSaving(false);
  };

  const onRetryProof = async () => {
    if (!orderId || !retryFile) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await uploadRaffleOrderProof(orderId, retryFile);
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

      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        Comprar números
      </h1>

      {invalid ? (
        <p className="mt-4 text-sm text-muted">
          No encontramos la rifa. Volvé a la página de la escuela y elegí tus
          números de nuevo.
        </p>
      ) : done ? (
        <div className="mt-6">
          <p
            role="status"
            className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10"
          >
            ¡Listo! Apartaste {done.length}{" "}
            {done.length === 1 ? "número" : "números"} ({done.map(fmt).join(", ")}
            ). La escuela confirmará tu pago; mientras tanto quedan reservados.
          </p>

          {proofUploaded ? (
            <p className="mt-4 text-sm text-success">
              Comprobante enviado. La escuela lo revisará.
            </p>
          ) : (
            <div className={`mt-4 ${cardClass("inset")}`}>
              <p className="text-sm text-muted">
                Si ya pagaste, subí tu comprobante para que la escuela confirme tu
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
              Volver a la rifa
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {taken.length > 0 && (
            <p className="rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
              {taken.length === 1
                ? `El número ${taken.map(fmt).join(", ")} ya fue tomado por otra persona y se quitó de tu compra.`
                : `Estos números ya fueron tomados y se quitaron de tu compra: ${taken.map(fmt).join(", ")}.`}
            </p>
          )}

          <div className={`text-sm ${cardClass("inset")}`}>
            <p className="font-medium text-foreground">Tus números</p>
            {available.length === 0 ? (
              <p className="mt-1 text-muted">
                Ninguno de los números que elegiste sigue disponible. Volvé a la
                rifa y elegí otros.
              </p>
            ) : (
              <>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {available.map((n) => (
                    <li
                      key={n}
                      className="inline-flex items-center rounded-lg bg-brand px-2.5 py-1 text-sm font-semibold tabular-nums text-white"
                    >
                      {fmt(n)}
                    </li>
                  ))}
                </ul>
                {raffle && (
                  <p className="mt-3 text-muted">
                    {available.length} ×{" "}
                    {formatMoney(raffle.pricePerNumber, raffle.currency)} ={" "}
                    <span className="font-semibold text-foreground">
                      {formatMoney(total, raffle.currency)}
                    </span>
                  </p>
                )}
              </>
            )}
          </div>

          {available.length > 0 && (
            <>
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
                Pagás directo a la escuela por los medios de arriba; escuelaplace
                nunca procesa pagos.
              </p>
            </>
          )}
        </form>
      )}
    </main>
  );
}
