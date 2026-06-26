import Image from "next/image";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { ToolManageBar } from "@/components/tools/ToolManageBar";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { PAGE_COVER_SIZES } from "@/lib/layout";
import { toolTypeMeta } from "@/lib/tools/registry";
import type { SchoolDoc, ToolDoc } from "@/types";

/**
 * The shared chrome for every public tool detail render (/school/[id]/tool/[toolId]): the JSON-LD
 * script, the back link to the school, the managers-only edit bar, the inactive notice, and the
 * cover image + title + kind badge. Each kind's render wraps its own kind-specific body in this
 * shell, supplying only:
 *   - `jsonLd`: its structured-data payload (Event / ItemList / …), serialized here, and
 *   - `badge`: an optional extra chip next to the kind badge (e.g. the event status), and
 *   - `titleAction`: an optional CTA placed in the title row (e.g. the reinado's sponsor button),
 *     full-width below the title on mobile and pulled to the far right beside it on desktop, and
 *   - `children`: everything below the title row (the kind's window line, description and body).
 *
 * SSR (no "use client") so it renders from the public pages. Centralizing the chrome here means a
 * new kind clones none of it — see TOOL_DETAIL_RENDERERS in the detail page.
 */
export function ToolDetailShell({
  id,
  toolId,
  tool,
  school,
  jsonLd,
  badge,
  titleAction,
  children,
}: {
  id: string;
  toolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
  jsonLd: object;
  badge?: ReactNode;
  titleAction?: ReactNode;
  children: ReactNode;
}) {
  const Icon = toolTypeMeta(tool.type).icon;

  return (
    <PageContainer variant="detail">
      {/* "<" escaped so owner-controlled text can't close the script tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="text-sm">
        <span className="inline-flex py-2 -my-2">
          <BackLink href={`/school/${id}`}>{school.name}</BackLink>
        </span>
      </div>

      {/* Edit shortcut — only the school's managers see this. Client island that renders null
          for visitors, so it never shifts the SSR layout. */}
      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          {toolTypeMeta(tool.type).inactiveNotice}
        </div>
      )}

      <article className={`mt-3 overflow-hidden ${cardClass("elevated", false)}`}>
        <div className="relative aspect-video w-full bg-brand-tint sm:aspect-[5/2]">
          {tool.coverUrl ? (
            <Image
              src={tool.coverUrl}
              alt=""
              fill
              priority
              sizes={PAGE_COVER_SIZES}
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full items-center justify-center text-brand-darker/30"
            >
              <Icon className="h-20 w-20" />
            </span>
          )}
        </div>

        <div className="p-5 sm:p-8">
          {/* Title row: stacks on mobile (title block, then the optional action full-width below),
              becomes a single row on desktop with the action pushed to the far right (sm:ml-auto). */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {tool.title}
              </h1>
              <ToolTypeBadge type={tool.type} />
              {badge}
            </div>
            {titleAction && (
              <div className="w-full sm:ml-auto sm:w-auto">{titleAction}</div>
            )}
          </div>

          {children}
        </div>
      </article>
    </PageContainer>
  );
}
