import type { ReactNode } from "react";

/**
 * Metric / trust pill — a soft-filled rounded pill with a leading icon, for inline signals
 * like a school's recent-supporters count or its typical confirmation time. Larger and
 * softer than `Badge` (which is the small status pill, `text-xs`): this one is `text-sm`
 * with an inset ring, sized to sit in a row of trust signals.
 *
 * Tones pair a soft `-tint` fill with an AA-on-tint foreground token (see the semantic
 * tokens in globals.css), so the fill and the text/icon always read together.
 */
export type StatChipTone = "success" | "muted" | "brand" | "warning";

const TONES: Record<StatChipTone, string> = {
  success: "bg-success-tint text-success ring-success/10",
  muted: "bg-surface text-muted ring-black/10",
  brand: "bg-brand-tint text-brand-darker ring-brand-dark/10",
  warning: "bg-warning-tint text-warning ring-warning/10",
};

export function StatChip({
  tone = "muted",
  icon,
  className = "",
  children,
}: {
  tone?: StatChipTone;
  /** Leading icon (sized e.g. `h-4 w-4`). */
  icon?: ReactNode;
  /** Extra layout classes for one-off needs — not for colors. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${TONES[tone]} ${className}`.trim()}
    >
      {icon}
      {children}
    </span>
  );
}
