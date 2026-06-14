import type { ReactNode } from "react";
import { cardClass, type CardVariant } from "./Card";

/**
 * A titled section rendered as a calm-depth card — the repeated block of every detail page
 * (business / school "Información", "Fotos", "Proyectos", "Comercios"…). Owns the canonical
 * page rhythm so callers stop hand-copying it: top margin `mt-4` between sibling sections
 * and `scroll-mt-6` so an anchored section clears the sticky header when a tab jumps to it.
 *
 * The heading is optional: a section whose body renders its own heading (e.g. the reviews
 * block) passes no `title` and supplies an `aria-label` for the landmark instead. Body
 * children keep their own top spacing (`mt-3` text, `mt-5` grids) — Section does not add it,
 * so existing layouts stay pixel-equivalent.
 */
export function Section({
  id,
  title,
  description,
  action,
  ariaLabel,
  variant = "elevated",
  className = "",
  children,
}: {
  /** Anchor id for the section tabs (scroll-spy). Omit for non-anchored sections. */
  id?: string;
  /** Section heading (Spanish copy). Rendered as `<h2>`. Omit when the body owns its own. */
  title?: ReactNode;
  /** Optional subtitle line under the heading (Spanish copy). */
  description?: ReactNode;
  /** Optional right-aligned control in the heading row (e.g. a "ver todos" link). */
  action?: ReactNode;
  /** Landmark label when there is no visible `title` (e.g. a photo grid). */
  ariaLabel?: string;
  /** Surface variant — see Card. */
  variant?: CardVariant;
  /** Extra layout classes for one-off needs — not for colors. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={`mt-4 scroll-mt-6 ${cardClass(variant)} ${className}`.trim()}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          {title && (
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {children}
    </section>
  );
}
