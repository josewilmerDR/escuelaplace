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
      {value.map((row, i) => (
        // Index key: rows are positional while being typed (no stable id exists yet).
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Método (Cuenta bancaria, SINPE Móvil, PayPal…)"
              aria-label={`Método de pago ${i + 1}: nombre`}
              maxLength={40}
              className="input"
            />
            <input
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder="Número, cuenta o usuario"
              aria-label={`Método de pago ${i + 1}: dato`}
              maxLength={120}
              className="input"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="mt-2 text-xs text-muted underline hover:text-red-600"
          >
            Quitar
          </button>
        </div>
      ))}

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
