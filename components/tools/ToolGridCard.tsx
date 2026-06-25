import Image from "next/image";
import Link from "next/link";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { CARD_COVER_ASPECT } from "@/lib/layout";
import { toolTypeMeta } from "@/lib/tools/registry";
import { type ToolDoc } from "@/types";

/** The compact created-tool grid: 2 per row on phones, up to 6 on desktop. */
export const TOOL_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

/** Cover `sizes` for a grid cell — at most ~150px wide on desktop, ~half the row on phones. */
const TOOL_GRID_SIZES = "(min-width: 1024px) 150px, (min-width: 640px) 30vw, 50vw";

/**
 * Compact management card for one created tool, shared by the Activas and Ocultas grids on the
 * per-kind manage page. The whole card links to the board's primary action for that kind: a reinado
 * opens its live management panel (tools/[toolId]/manage) so editing is a deliberate step, not the
 * default landing; every other kind goes straight to its edit page. The cover falls back to the
 * kind's icon (mirroring the public ToolCard) and a "Oculta" chip overlays a hidden tool. Kept
 * small so the grid packs many at a glance.
 */
export function ToolGridCard({
  schoolId,
  tool,
}: {
  schoolId: string;
  tool: ToolDoc;
}) {
  const Icon = toolTypeMeta(tool.type).icon;
  // A reinado lands on its control panel (follow votes / run the gala); the edit page sits behind an
  // explicit "Editar reinado" button there. Other kinds keep the edit page as their primary action.
  const href =
    tool.type === "pageant"
      ? `/panel/school/${schoolId}/tools/${tool.id}/manage`
      : `/panel/school/${schoolId}/tools/${tool.id}`;
  return (
    <li>
      <Link
        href={href}
        className={`group flex h-full flex-col overflow-hidden ${cardClass(
          "elevated",
          false,
        )} transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <div className={`relative w-full bg-brand-tint ${CARD_COVER_ASPECT}`}>
          {tool.coverUrl ? (
            <Image
              src={tool.coverUrl}
              alt=""
              fill
              sizes={TOOL_GRID_SIZES}
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full items-center justify-center text-brand-darker/30"
            >
              <Icon className="h-8 w-8" />
            </span>
          )}
          {tool.status === "inactive" && (
            <span className="absolute left-2 top-2">
              <Badge tone="neutral">Oculta</Badge>
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-brand-darker">
            {tool.title}
          </h3>
          <div className="mt-auto">
            <ToolTypeBadge type={tool.type} />
          </div>
        </div>
      </Link>
    </li>
  );
}
