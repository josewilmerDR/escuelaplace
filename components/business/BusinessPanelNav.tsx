"use client";

/**
 * Lateral nav between a business's manage screens (Editar / Apoyar una escuela / Métricas).
 * The panel hub (/panel) links into each section, but once inside one the owner had no way
 * to jump to a sibling without going back to the hub — this keeps them one tap apart.
 * Métricas is gated on the business being `active`, exactly like the hub card (a draft has
 * no public funnel yet). The current section renders as plain text (aria-current), not a
 * link, so it can't navigate to itself.
 */
import Link from "next/link";

export type BusinessPanelSection = "edit" | "subscribe" | "metrics";

const SECTIONS: { key: BusinessPanelSection; label: string; activeOnly: boolean }[] = [
  { key: "edit", label: "Editar página", activeOnly: false },
  { key: "subscribe", label: "Apoyar una escuela", activeOnly: false },
  { key: "metrics", label: "Ver métricas", activeOnly: true },
];

export function BusinessPanelNav({
  businessId,
  active,
  current,
}: {
  businessId: string;
  /** Whether the business is published (`status === "active"`). Gates the metrics tab. */
  active: boolean;
  current: BusinessPanelSection;
}) {
  return (
    <nav
      aria-label="Secciones del comercio"
      className="mt-4 flex flex-wrap gap-2"
    >
      {SECTIONS.filter(
        (s) => !s.activeOnly || active || s.key === current,
      ).map((s) =>
        s.key === current ? (
          <span
            key={s.key}
            aria-current="page"
            className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 py-2 text-sm font-medium text-foreground ring-1 ring-black/5"
          >
            {s.label}
          </span>
        ) : (
          <Link
            key={s.key}
            href={`/panel/business/${businessId}/${s.key}`}
            className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            {s.label}
          </Link>
        ),
      )}
    </nav>
  );
}
