"use client";

/**
 * Clickable card picker for a tool's kind (rifa, bingo, venta…). Replaces a plain
 * <select>: each kind is its own card so it reads as a deliberate choice — and it's the
 * seam where each kind will later grow its OWN creation flow (today every kind shares the
 * generic form; tomorrow a card can route to a bespoke one).
 *
 * Accessible radiogroup: a real (visually hidden) <input type="radio"> backs each card, so
 * keyboard arrow-selection and screen-reader semantics come for free; the visible selected
 * state is React-driven from `value`. The label's `has-[:focus-visible]` ring surfaces
 * keyboard focus on the card itself.
 *
 * The card's inner visual (icon + label + hint) lives in <ToolTypeCardBody> so the
 * navigation-only catalog on the tools hub (<ToolTypeMenu>) renders identical cards as
 * links without duplicating the markup.
 */
import { cardClass } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";
import { TOOL_TYPE_LIST, type ToolTypeMeta } from "@/lib/tools/registry";
import type { ToolType } from "@/types";

/**
 * The visual contents of a tool-type card — the icon chip, the label and the one-line hint.
 * Shared by the radio picker (this file) and the link menu (<ToolTypeMenu>); the wrapper
 * (a <label> here, a <Link> there) and the selected check are supplied by each caller.
 */
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

export function ToolTypePicker({
  value,
  onChange,
  name = "tool-type",
}: {
  value: ToolType;
  onChange: (type: ToolType) => void;
  /** Radio group name — set a unique value if two pickers ever share a page. */
  name?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de herramienta"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {TOOL_TYPE_LIST.map((t) => {
        const selected = value === t.key;
        return (
          <label
            key={t.key}
            className={`relative flex cursor-pointer flex-col gap-2 ${cardClass(
              selected ? "selected" : "elevated",
              false,
            )} p-4 transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand`}
          >
            <input
              type="radio"
              name={name}
              value={t.key}
              checked={selected}
              onChange={() => onChange(t.key)}
              className="sr-only"
            />
            <ToolTypeCardBody meta={t} selected={selected} />
            {selected && (
              <CheckIcon
                aria-hidden
                className="absolute right-3 top-3 h-5 w-5 text-brand"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
