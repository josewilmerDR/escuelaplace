import type { ReactNode } from "react";

/**
 * The single status/label pill primitive. Every badge — verification, business status,
 * subscription status, project status, donor tier, support tier — renders through this so
 * the geometry (radius, padding, text size, weight) is identical everywhere and the
 * per-status palette lives in ONE place. The domain components own the status→tone+label
 * mapping; this owns how a pill looks.
 *
 * Tones keep the established status palette (the soft -100 fills the app has always used)
 * rather than the semantic text tokens, which are tuned for inline feedback text/banners on
 * white — a pill needs a filled chip, not body text. Confining those raw color utilities to
 * this file is the cohesion win.
 */
export type BadgeTone =
  | "neutral"
  | "info"
  | "brand"
  | "outline"
  | "success"
  | "warning"
  | "alert"
  | "danger"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-muted",
  info: "bg-brand-tint text-brand-darker",
  brand: "bg-brand-darker text-white",
  outline: "border border-border text-muted",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  alert: "bg-orange-100 text-orange-800",
  danger: "bg-red-100 text-red-800",
  bronze: "bg-amber-100 text-amber-900",
  silver: "bg-slate-200 text-slate-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-violet-100 text-violet-800",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  /** Extra classes for one-off layout needs (margins, etc.) — not for colors. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
