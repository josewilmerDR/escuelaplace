"use client";

/**
 * Lateral nav between a school's manage screens (Editar / Confirmar aportes / Proyectos /
 * Aportes a proyectos). The panel hub (/panel) links into each section, but once inside one
 * the owner had no way to jump to a sibling without going back to the hub — this keeps them
 * one tap apart. Unlike the business nav there is no gating: all four sections are always
 * shown. The current section renders as plain text (aria-current), not a link, so it can't
 * navigate to itself.
 */
import Link from "next/link";

export type SchoolPanelSection =
  | "edit"
  | "subscriptions"
  | "projects"
  | "project-contributions";

const SECTIONS: { key: SchoolPanelSection; label: string }[] = [
  { key: "edit", label: "Editar página" },
  { key: "subscriptions", label: "Confirmar aportes" },
  { key: "projects", label: "Proyectos" },
  { key: "project-contributions", label: "Aportes a proyectos" },
];

export function SchoolPanelNav({
  schoolId,
  current,
}: {
  schoolId: string;
  current: SchoolPanelSection;
}) {
  return (
    <nav
      aria-label="Secciones de la escuela"
      className="mt-4 flex flex-wrap gap-2"
    >
      {SECTIONS.map((s) =>
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
            href={`/panel/school/${schoolId}/${s.key}`}
            className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            {s.label}
          </Link>
        ),
      )}
    </nav>
  );
}
