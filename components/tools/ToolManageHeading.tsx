import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/BackLink";

/**
 * Shared title row for a tool's per-instance management panel (tools/[toolId]/manage). A back link
 * to the tool's per-kind list, then the title and an inline action button (e.g. "Editar") on one
 * row. The button is shrink-0 and the title min-w-0 (it wraps instead), so on mobile the button
 * never collapses to a second row. Used by both the reinado and rifa panels so the header never
 * shifts between them.
 *
 * `backAction` is an optional node rendered inline with the back link (right-aligned on that row) —
 * e.g. a gear/settings menu that collects the panel's actions next to "Volver a …".
 */
export function ToolManageHeading({
  backHref,
  backLabel,
  title,
  subtitle,
  action,
  backAction,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backAction?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <BackLink href={backHref}>{backLabel}</BackLink>
        </p>
        {backAction && <div className="shrink-0">{backAction}</div>}
      </div>
      <header className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      </header>
    </>
  );
}
