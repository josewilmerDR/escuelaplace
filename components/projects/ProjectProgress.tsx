/**
 * Funding progress for a project: a bar plus the public figures (raised / goal in the
 * project's currency, and how many people contributed). Server-safe presentational
 * component, shared by the project card and the detail page.
 *
 * Public policy: the aggregate `raised` and a contributor COUNT are shown; an individual
 * contributor's amount never is (same stance as subscriptions). Amounts are in the
 * school-chosen currency — the platform is country-agnostic and never assumes colones.
 */
import { projectProgress } from "@/lib/firestore";
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
  const reached = goal > 0 && raised >= goal;

  return (
    <div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-border"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Avance de la meta"
      >
        <div
          className={`h-full rounded-full ${reached ? "bg-green-600" : "bg-brand"}`}
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
        {contributorsCount > 0 && (
          <span className="text-muted">
            {contributorsCount === 1
              ? "1 persona aportó"
              : `${contributorsCount} personas aportaron`}
          </span>
        )}
      </div>
    </div>
  );
}
