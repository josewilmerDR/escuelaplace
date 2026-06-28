"use client";

/**
 * Lateral nav between a school's manage screens (Editar / Actividad / Proyectos / Herramientas
 * / Agradecimientos). The same destinations live in the SchoolManageBar gear menu on the public
 * profile, but once inside a manage page the board had no way to jump to a sibling without going
 * back through the profile — this keeps them one tap apart, mirroring BusinessPanelNav.
 *
 * The current section renders as plain text (aria-current), not a link, so it can't navigate to
 * itself. The Actividad entry carries the pending-confirmations badge (same count + cue as the
 * SchoolManageBar bell), so the queue is visible from every manage page, not just the profile.
 *
 * Client island: it reads the live pending count. Mount it per page (there is no shared layout
 * for these routes), right under the page title.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { getPendingActivityCountBySchool } from "@/lib/firestore";

export type SchoolPanelSection =
  | "edit"
  | "activity"
  | "projects"
  | "tools"
  | "thanks";

const SECTIONS: { key: SchoolPanelSection; label: string }[] = [
  { key: "edit", label: "Editar página" },
  { key: "activity", label: "Actividad" },
  { key: "projects", label: "Proyectos" },
  { key: "tools", label: "Herramientas" },
  { key: "thanks", label: "Agradecimientos" },
];

export function SchoolPanelNav({
  schoolId,
  current,
}: {
  schoolId: string;
  current: SchoolPanelSection;
}) {
  // Pending-confirmations count for the Actividad badge — same source as the SchoolManageBar bell.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getPendingActivityCountBySchool(schoolId)
      .then((count) => {
        if (!cancelled) setPendingCount(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  return (
    <nav
      aria-label="Secciones de la escuela"
      className="mt-4 flex flex-wrap gap-2"
    >
      {SECTIONS.map((s) => {
        const isActive = s.key === current;
        const showBadge = s.key === "activity" && pendingCount > 0;
        // Fold the count into the accessible name so it doesn't read as a bare "Actividad 5".
        const ariaLabel = showBadge
          ? `Actividad (${pendingCount} pendientes)`
          : undefined;
        const badge = showBadge ? (
          // Red is the universal "needs attention" cue (no token on the brand scale), same as
          // the bell badge. aria-hidden: the count lives in the link's aria-label instead.
          <span
            aria-hidden="true"
            className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white"
          >
            {pendingCount}
          </span>
        ) : null;

        return isActive ? (
          <span
            key={s.key}
            aria-current="page"
            aria-label={ariaLabel}
            className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 py-2 text-sm font-medium text-foreground ring-1 ring-black/5"
          >
            {s.label}
            {badge}
          </span>
        ) : (
          <Link
            key={s.key}
            href={`/panel/school/${schoolId}/${s.key}`}
            aria-label={ariaLabel}
            className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            {s.label}
            {badge}
          </Link>
        );
      })}
    </nav>
  );
}
