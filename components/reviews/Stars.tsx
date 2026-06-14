import { formatRating } from "@/lib/format";

/**
 * Read-only star display for a rating in [0,5]. Fractional fill: the brand overlay is
 * clipped to value/5 of the row's width, so 4.5 reads as four and a half stars instead
 * of rounding up to five (Math.round oversold the average).
 */
export function Stars({
  value,
  className = "",
  decorative = false,
}: {
  value: number;
  className?: string;
  /** Hide from screen readers when a visible numeric rating sits right next to it —
   * otherwise the rating is announced twice. */
  decorative?: boolean;
}) {
  const pct = (Math.min(5, Math.max(0, value)) / 5) * 100;
  const label = `${formatRating(value)} de 5`;
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={`relative inline-block whitespace-nowrap leading-none ${className}`}
    >
      <span aria-hidden className="text-slate-300">
        ★★★★★
      </span>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-brand"
        style={{ width: `${pct}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}
