/**
 * Read-only list of a school's published payment methods, for the support flows
 * (donate, business subscribe). Three states from getVerifiedSchoolPaymentMethods:
 * null = school not verified (payment data hidden) → the flow-specific amber text;
 * [] = verified but nothing published yet; otherwise the label:value list.
 *
 * Optionally appends the responsiveness line ("normalmente confirma en ~X") — shown
 * in every state: right before committing money is where "will anyone ever confirm
 * this?" weighs the most.
 *
 * Always carries the disclaimer: the information comes from the school and the
 * platform never processes nor certifies payments.
 */
import { formatApproxDuration } from "@/lib/format";
import type { PaymentMethod } from "@/types";

export function PaymentMethodsInfo({
  methods,
  unverifiedText,
  confirmationTimeMs,
}: {
  methods: PaymentMethod[] | null;
  /** Shown when the school is not verified (the only flow-specific part). */
  unverifiedText: string;
  /** Average first-confirmation time (averageConfirmationTimeMs); null/undefined hides
   * the line. */
  confirmationTimeMs?: number | null;
}) {
  const responseLine = confirmationTimeMs != null && (
    <p className="mt-2 text-xs font-medium text-muted">
      Normalmente confirma los aportes en{" "}
      {formatApproxDuration(confirmationTimeMs)}.
    </p>
  );

  if (methods === null) {
    return (
      <div>
        {/* warning token: AA on the surface/tint the caller renders behind it. */}
        <p className="text-warning">{unverifiedText}</p>
        {responseLine}
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div>
        <p className="text-muted">
          Esta escuela todavía no publicó sus métodos de pago. Consultale
          directamente cómo hacerle llegar tu aporte.
        </p>
        {responseLine}
      </div>
    );
  }

  return (
    <div>
      <p>Pagá directo a la escuela por cualquiera de estos medios:</p>
      {/* Scannable list: each method on its own padded row on a white inset, so the
          label/value pairs read as a clean table rather than a run-on line. */}
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
        {methods.map((m, i) => (
          <li
            key={i}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2"
          >
            <span className="font-medium text-foreground">{m.label}</span>
            <span className="text-muted">{m.value}</span>
          </li>
        ))}
      </ul>
      {responseLine}
      <p className="mt-2 text-xs text-muted">
        Información publicada por la escuela — escuelaplace no procesa ni
        certifica pagos.
      </p>
    </div>
  );
}
