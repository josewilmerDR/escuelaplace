/**
 * Funding progress for a project: a bar plus the public figures (raised / goal in the
 * project's currency, and how many people contributed). Server-safe presentational
 * component, shared by the project card and the detail page.
 *
 * Public policy: the aggregate `raised` and a contributor COUNT are shown; an individual
 * contributor's amount never is (same stance as subscriptions). Amounts are in the
 * school-chosen currency — the platform is country-agnostic and never assumes colones.
 */
import { isGoalReached, projectProgress } from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type { ProjectCurrency } from "@/types";

export function ProjectProgress({
  raised,
  goal,
  currency,
  contributorsCount,
  compact = false,
}: {
  raised: number;
  goal: number;
  currency: ProjectCurrency;
  contributorsCount: number;
  /** Tighter typography for cards. */
  compact?: boolean;
}) {
  const fraction = projectProgress(raised, goal);
  const percent = Math.round(fraction * 100);
  const reached = isGoalReached(raised, goal);
  // Actionable "how much is left" figure: only meaningful for an in-progress, funded goal.
  const remaining = !reached && goal > 0 && raised < goal ? goal - raised : 0;
  const showRemaining = remaining > 0;

  return (
    <div>
      {/* Soft rounded track with a brand fill; the reached state fills with the success
          token. The ARIA values and the raised/goal math above are unchanged. */}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-black/5"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Avance de la meta"
      >
        <div
          className={`h-full rounded-full ${reached ? "bg-success" : "bg-brand"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div
        className={`mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        <span className="font-medium text-foreground">
          {formatMoney(raised, currency)}
          <span className="font-normal text-muted">
            {" "}
            de {formatMoney(goal, currency)} ({percent}%)
          </span>
        </span>
        {(showRemaining || contributorsCount > 0 || !reached) && (
          <span className="text-muted">
            {[
              showRemaining
                ? `Faltan ${formatMoney(remaining, currency)}`
                : null,
              contributorsCount > 0
                ? contributorsCount === 1
                  ? "1 persona aportó"
                  : `${contributorsCount} personas aportaron`
                : // Cold start: invite the first contribution instead of showing a
                  // silent "0" — only while the goal is still open.
                  !reached
                  ? "Sé la primera persona en aportar"
                  : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}
