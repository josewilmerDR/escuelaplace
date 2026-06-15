"use client";

/**
 * Editable label:value list of a school's payment methods, used by the create and edit
 * school forms. Free text on both sides so any country's rails fit (bank account,
 * SINPE Móvil, Modo, Bizum, Pix, PayPal…). Purely informational for the supporter —
 * the platform never processes nor certifies payments.
 *
 * Controlled: the parent owns the rows (including incomplete ones being typed) and
 * decides at save time which rows are complete enough to persist.
 */
import type { PaymentMethod } from "@/types";

/** UI cap: enough for bank + local rail + international, without inviting noise. */
export const PAYMENT_METHODS_MAX = 5;

export function PaymentMethodsEditor({
  value,
  onChange,
}: {
  value: PaymentMethod[];
  onChange: (rows: PaymentMethod[]) => void;
}) {
  const update = (index: number, patch: Partial<PaymentMethod>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-3">
      {value.map((row, i) => {
        // A row is "half-complete" when exactly one side is filled (after trim):
        // the parent drops such rows at save time, so warn before it's lost.
        const hasLabel = row.label.trim() !== "";
        const hasValue = row.value.trim() !== "";
        const halfComplete = hasLabel !== hasValue;
        const hintId = halfComplete ? `payment-method-${i}-hint` : undefined;

        return (
          // Index key: rows are positional while being typed (no stable id exists yet).
          // Each method is a soft inset row (calm-depth panel, no hard border) so the
          // label:value pair reads as one unit with its remove action.
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl bg-surface p-3 ring-1 ring-black/5"
          >
            <div className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Método (Cuenta bancaria, SINPE Móvil, PayPal…)"
                  aria-label={`Método de pago ${i + 1}: nombre`}
                  aria-describedby={hintId}
                  maxLength={40}
                  className="input"
                />
                <input
                  value={row.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="Número, cuenta o usuario"
                  aria-label={`Método de pago ${i + 1}: dato`}
                  aria-describedby={hintId}
                  maxLength={120}
                  className="input"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Quitar método de pago ${i + 1}`}
                className="mt-1.5 inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
              >
                Quitar
              </button>
            </div>
            {halfComplete && (
              <p
                id={hintId}
                role="status"
                className="rounded-xl bg-warning-tint p-2 text-xs text-warning ring-1 ring-warning/10"
              >
                Completá ambos campos: esta fila no se guardará.
              </p>
            )}
          </div>
        );
      })}

      {value.length < PAYMENT_METHODS_MAX && (
        <button
          type="button"
          onClick={() => onChange([...value, { label: "", value: "" }])}
          className="btn btn-outline w-fit"
        >
          Agregar método de pago
        </button>
      )}
    </div>
  );
}
