import type { ReactNode } from "react";

/**
 * The shared "notice strip" — a tinted, rounded panel with an optional leading icon and a short
 * message, used for inline page-level notices (e.g. a school's "datos sin verificar" warning or a
 * comercio's discount). One place for the shell so every notice reads the same; the tone picks the
 * color tokens. Purely presentational and server-compatible (no state/role by default — pass
 * `role="alert"/"status"` only where a notice must be announced).
 *
 * The icon is passed pre-sized by the caller (e.g. `<WarningIcon className="mt-0.5 h-5 w-5
 * shrink-0" />`) and rendered as a direct flex sibling of the content, so the markup matches the
 * hand-written banners it replaces. `className` carries caller-specific spacing (e.g. `mt-4`).
 */
const TONE_CLASS = {
  warning: "bg-warning-tint text-warning ring-warning/10",
  error: "bg-error-tint text-error ring-error/10",
  success: "bg-success-tint text-success ring-success/10",
  // Positive, on-brand notice (e.g. a comercio's active discount). Distinct from the
  // semantic states above: a deal is an invitation, not an alert, so it must NOT borrow
  // the amber `warning` palette. Mirrors the `brand` tone of Badge/StatChip.
  promo: "bg-brand-tint text-brand-darker ring-brand-darker/10",
} as const;

export interface BannerProps {
  tone: keyof typeof TONE_CLASS;
  /** Leading icon, already sized by the caller. Omit for an icon-less strip. */
  icon?: ReactNode;
  children: ReactNode;
  /** Caller-specific spacing/layout (e.g. "mt-4"). */
  className?: string;
  role?: "alert" | "status";
}

export function Banner({ tone, icon, children, className, role }: BannerProps) {
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-2xl p-4 text-sm ring-1 ${TONE_CLASS[tone]}${
        className ? ` ${className}` : ""
      }`}
    >
      {icon}
      {children}
    </div>
  );
}
