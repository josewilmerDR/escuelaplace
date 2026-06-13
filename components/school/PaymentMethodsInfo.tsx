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
    <p className="mt-2 text-xs font-medium text-sky-800">
      Normalmente confirma los aportes en{" "}
      {formatApproxDuration(confirmationTimeMs)}.
    </p>
  );

  if (methods === null) {
    return (
      <div>
        <p className="text-amber-800">{unverifiedText}</p>
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
      <ul className="mt-2 space-y-1">
        {methods.map((m, i) => (
          <li key={i}>
            <span className="font-medium">{m.label}:</span> {m.value}
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
