"use client";

/**
 * Lateral nav between a school's manage screens. Four tabs: the unified "Actividad" inbox
 * (everything the board must confirm — supports, project contributions and the per-tool orders,
 * folded into one queue) and the three configuration screens (Editar / Proyectos / Herramientas).
 * The five old per-type confirmation tabs collapsed into Actividad (their routes now redirect
 * there); the live bingo console is launched from inside its Bingo tool and shows under the
 * Herramientas tab. The panel hub (/panel) links into each section; this keeps siblings one tap
 * apart. The current section renders as plain text (aria-current), not a link, so it can't
 * navigate to itself.
 */
import Link from "next/link";

/** The four manage sections (and the value pages pass as `current`). */
export type SchoolPanelSection = "activity" | "edit" | "projects" | "tools";

const SECTIONS: { key: SchoolPanelSection; label: string }[] = [
  { key: "activity", label: "Actividad" },
  { key: "edit", label: "Editar página" },
  { key: "projects", label: "Proyectos" },
  { key: "tools", label: "Herramientas" },
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
