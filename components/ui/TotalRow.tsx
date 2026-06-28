import type { ReactNode } from "react";

/**
 * The amount summary row a contribution flow renders just before its submit button: a quiet
 * label on the left and the figure given real weight on the right (`text-lg`, semibold). The
 * sum the person is about to commit is the number that decides the action, so it must not read
 * as a muted hint tucked under the input — this is the shared row the donate / fund / subscribe /
 * pageant-support flows use, so the total looks (and weighs) the same everywhere.
 *
 * The `amount` is pre-formatted by the caller (`formatMoney` / `formatColones`) — the platform is
 * country-agnostic and never assumes a currency. Purely presentational and server-safe.
 */
export function TotalRow({
  label = "Total",
  amount,
}: {
  /** Left-side label. Defaults to "Total"; pass e.g. "Valor estimado" for in-kind value. */
  label?: ReactNode;
  /** Pre-formatted amount string (e.g. `formatMoney(amount, currency)`). */
  amount: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {amount}
      </span>
    </div>
  );
}
