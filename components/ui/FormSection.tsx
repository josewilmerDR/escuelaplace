import type { ReactNode } from "react";

/**
 * A titled group of form controls — a `<fieldset>` with a `<legend>` and optional helper
 * line. Breaks the long create/edit forms (business, school) into labeled sections
 * ("Información básica", "Ubicación y contacto", "Pagos"…) so they read as a sequence of
 * small groups instead of one wall of inputs, while keeping the markup accessible (one
 * `<legend>` per `<fieldset>`).
 *
 * Two looks, matching what the forms already used:
 *  - default: a plain group (legend over the fields) for the form's own sections.
 *  - `boxed`: an elevated calm-depth card (ring + soft shadow, no hard border) — the
 *    treatment the payment-methods / discount blocks had, for a self-contained sub-group
 *    that benefits from a visual frame.
 *
 * The fields are laid out as a vertical stack by default (the `gap-4` the forms use);
 * pass `contentClassName` for a different layout (e.g. a responsive grid).
 */
export function FormSection({
  legend,
  description,
  boxed = false,
  contentClassName = "flex flex-col gap-4",
  className = "",
  children,
}: {
  /** Section title (Spanish copy). Rendered as the `<legend>`. */
  legend: string;
  /** Optional helper line under the legend (Spanish copy). */
  description?: ReactNode;
  /** Bordered-card treatment for a self-contained sub-group (payments, discount). */
  boxed?: boolean;
  /** Layout for the controls. Defaults to a vertical stack. */
  contentClassName?: string;
  /** Extra classes on the `<fieldset>` for one-off spacing needs. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={`${
        boxed ? "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5" : ""
      } ${className}`.trim()}
    >
      <legend
        className={`text-base font-semibold tracking-tight text-foreground ${
          boxed ? "px-1" : ""
        }`.trim()}
      >
        {legend}
      </legend>
      {description && (
        <p className={`text-sm text-muted ${boxed ? "mb-3 mt-1" : "mt-1"}`}>
          {description}
        </p>
      )}
      <div className={`${description || boxed ? "mt-4" : "mt-3"} ${contentClassName}`}>
        {children}
      </div>
    </fieldset>
  );
}
