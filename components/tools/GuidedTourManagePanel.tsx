"use client";

/**
 * The "Visita guiada" (guided tour) control center, rendered by tools/[toolId]/manage once the
 * dispatcher has loaded the school + tool and checked that the viewer manages the school. A tour is
 * config-only — no orders, no reservations, nothing live to follow (the only public action is a
 * WhatsApp consult) — so this panel is a READ-ONLY overview: a config recap of the stages so the
 * board sees the route at a glance, plus the "Ver página pública" footer (no share/consult pair
 * here) and the "Editar visita guiada" button on the title row. PURELY INFORMATIONAL — the platform
 * never processes money.
 */
import Link from "next/link";
import { ToolManageFooter } from "@/components/tools/ToolManageFooter";
import { PageTitle } from "@/components/ui/PageTitle";
import { cardClass } from "@/components/ui/Card";
import { toolConfigOf } from "@/lib/firestore";
import type { SchoolDoc, ToolDoc } from "@/types";

export function GuidedTourManagePanel({
  schoolId,
  school,
  tool,
}: {
  schoolId: string;
  school: SchoolDoc;
  tool: ToolDoc;
}) {
  const toolId = tool.id;
  const tour = toolConfigOf(tool, "guided_tour")!;
  const stages = tour.stages ?? [];

  return (
    <main>
      <PageTitle
        backHref={`/panel/school/${schoolId}/tools/manage/guided_tour`}
        backLabel="Volver a visitas guiadas"
        title={tool.title}
        subtitle={`Gestión de la visita guiada · ${school.name}`}
        action={
          <Link
            href={`/panel/school/${schoolId}/tools/${toolId}`}
            className="btn btn-outline shrink-0"
          >
            Editar visita guiada
          </Link>
        }
      />

      {/* Read-only recap of the route: the board sees the stages (and their media) at a glance
          WITHOUT entering the editor. */}
      <section className={`mt-8 ${cardClass("inset")}`}>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Etapas ({stages.length})
        </h2>
        {stages.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Esta visita guiada aún no tiene etapas. Agrégalas desde “Editar visita guiada”.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {stages.map((stage, i) => {
              const photoCount = stage.photos?.length ?? 0;
              const media = [
                photoCount > 0
                  ? `${photoCount} ${photoCount === 1 ? "foto" : "fotos"}`
                  : null,
                stage.videoUrl ? "video" : null,
              ].filter(Boolean);
              return (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                >
                  <span className="min-w-0 text-foreground">
                    <span className="tabular-nums text-muted">{i + 1}.</span>{" "}
                    {stage.title.trim() || "Etapa sin título"}
                  </span>
                  {media.length > 0 && (
                    <span className="tabular-nums text-xs text-muted">
                      {media.join(" · ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <p className="mt-6 text-sm text-muted">
        Esta herramienta no maneja reservas: el público te contacta por WhatsApp con el botón
        “Consultar”.
      </p>

      <ToolManageFooter
        schoolId={schoolId}
        tool={tool}
        school={school}
        showShareActions={false}
      />
    </main>
  );
}
