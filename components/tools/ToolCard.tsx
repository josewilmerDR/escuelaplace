import Image from "next/image";
import Link from "next/link";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { toolTypeMeta } from "@/lib/tools/registry";
import { toolWindowLabel } from "@/lib/firestore";
import { CARD_COVER_ASPECT, CARD_COVER_SIZES } from "@/lib/layout";
import type { ToolDoc } from "@/types";

/**
 * Read-only card for a school tool (rifa/venta/etc.), shown on the public "Principal" tab.
 * Mirrors ProjectCard's calm-depth surface (stretched link, cover 3:2 with a typed-icon
 * fallback, body with title + kind badge + clamp). Universal (no hooks/directives), so it
 * renders both from the public SSR page and the client panel list.
 */
export function ToolCard({ tool }: { tool: ToolDoc }) {
  const Icon = toolTypeMeta(tool.type).icon;
  const window = toolWindowLabel(tool);
  return (
    <Link
      href={`/school/${tool.schoolId}/tool/${tool.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
    >
      <div className={`relative w-full bg-brand-tint ${CARD_COVER_ASPECT}`}>
        {tool.coverUrl ? (
          <Image
            src={tool.coverUrl}
            alt=""
            fill
            sizes={CARD_COVER_SIZES}
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-full items-center justify-center text-brand-darker/30"
          >
            <Icon className="h-10 w-10" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-foreground group-hover:text-brand-darker">
            {tool.title}
          </h3>
          <ToolTypeBadge type={tool.type} />
        </div>
        {tool.description && (
          <p className="line-clamp-2 text-sm text-muted">{tool.description}</p>
        )}
        {window && <p className="mt-auto text-xs text-muted">{window}</p>}
      </div>
    </Link>
  );
}
