"use client";

/**
 * The inner visual of a tool-type card — the icon chip, the label and the one-line hint.
 * Rendered by the navigation-only catalog on the tools hub (<ToolTypeMenu>) as links; the
 * wrapper and any selected check are supplied by each caller, so the markup lives in one place.
 */
import { type ToolTypeMeta } from "@/lib/tools/registry";

export function ToolTypeCardBody({
  meta,
  selected = false,
}: {
  meta: ToolTypeMeta;
  selected?: boolean;
}) {
  const Icon = meta.icon;
  return (
    <>
      <span
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
          selected ? "bg-brand text-white" : "bg-brand-tint text-brand-darker"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="font-semibold leading-snug text-foreground">
        {meta.label}
      </span>
      <span className="text-xs text-muted">{meta.hint}</span>
    </>
  );
}
