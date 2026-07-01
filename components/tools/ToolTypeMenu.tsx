/**
 * The tools hub's directory: one card per tool kind (rifa, bingo, venta…). The whole card is a
 * single link to the kind's "Administrar" page, where the board lists that kind's tools and
 * creates new ones — a clickable card is affordance enough (no explicit buttons), a pattern users
 * already know from other apps. A neutral badge shows how many of that kind already exist, so the
 * board reads its inventory at a glance. The hub stays a pure directory; the per-kind listing,
 * editing and creation live on the manage page.
 *
 * Server-safe: plain links + the shared <ToolTypeCardBody>, no client state. Counts are computed
 * by the (client) hub and passed in, so this component never fetches.
 */
import Link from "next/link";
import { ToolTypeCardBody } from "@/components/tools/ToolTypePicker";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { isToolEnabledForCommunity } from "@/lib/community";
import { TOOL_TYPE_LIST } from "@/lib/tools/registry";
import type { ToolType } from "@/types";

export function ToolTypeMenu({
  schoolId,
  counts,
}: {
  schoolId: string;
  /** How many created tools each kind has — drives the per-card count badge. */
  counts: Record<ToolType, number>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TOOL_TYPE_LIST.filter((t) => isToolEnabledForCommunity(t.key)).map((t) => {
        const count = counts[t.key] ?? 0;
        return (
          <Link
            key={t.key}
            href={`/panel/school/${schoolId}/tools/manage/${t.key}`}
            aria-label={`Administrar ${t.pluralLabel}`}
            className={`relative flex flex-col gap-2 ${cardClass(
              "elevated",
              false,
            )} p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
          >
            <ToolTypeCardBody meta={t} />
            {count > 0 && (
              <span className="absolute right-3 top-3">
                <Badge tone="neutral">{count}</Badge>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
