import { cardClass } from "@/components/ui/Card";

/**
 * A single tally cell in a tool manage-panel's stats row (e.g. "Vendidos 12 / 30",
 * "Recaudado ₡15 000"): a muted label, a large tabular number, and a small hint line.
 * `tone` tints the number for at-a-glance status (success/warning); default is neutral.
 * Shared by the raffle, sale and bingo manage panels so the cell reads identically everywhere.
 */
export function ManageStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "warning";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className={cardClass("inset")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </dd>
      <p className="mt-1 text-xs tabular-nums text-muted">{hint}</p>
    </div>
  );
}
