"use client";

/**
 * The "Evento" (event) control center, rendered by tools/[toolId]/manage once the dispatcher has
 * loaded the school + tool and checked that the viewer manages the school. An event is config-only —
 * no orders, no RSVP, nothing live to follow (the only public action is a WhatsApp consult) — so this
 * panel is a READ-ONLY overview: a config recap (date + Próximo/Hoy/Finalizó status, place, map,
 * gallery) so the board sees the announcement at a glance, plus the public/share/consult footer and
 * the "Editar evento" button on the title row. PURELY INFORMATIONAL — the platform never processes
 * money.
 */
import Link from "next/link";
import { EventStatusBadge } from "@/components/tools/EventStatusBadge";
import { ToolManageFooter } from "@/components/tools/ToolManageFooter";
import { ToolManageHeading } from "@/components/tools/ToolManageHeading";
import { cardClass } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/format";
import { toolConfigOf } from "@/lib/firestore";
import type { SchoolDoc, ToolDoc } from "@/types";

export function EventManagePanel({
  schoolId,
  school,
  tool,
}: {
  schoolId: string;
  school: SchoolDoc;
  tool: ToolDoc;
}) {
  const toolId = tool.id;
  const event = toolConfigOf(tool, "event")!;
  const dateMs = event.date ? event.date.toMillis() : null;
  const photoCount = event.photos?.length ?? 0;

  return (
    <main>
      <ToolManageHeading
        backHref={`/panel/school/${schoolId}/tools/manage/event`}
        backLabel="Volver a eventos"
        title={tool.title}
        subtitle={`Gestión del evento · ${school.name}`}
        action={
          <Link
            href={`/panel/school/${schoolId}/tools/${toolId}`}
            className="btn btn-outline shrink-0"
          >
            Editar evento
          </Link>
        }
      />

      {/* Read-only configuration recap: the board sees the announcement at a glance WITHOUT entering
          the editor. The Próximo/Hoy/Finalizó chip reads against the viewer's clock. */}
      <section className={`mt-8 ${cardClass("inset")}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Configuración
          </h2>
          {dateMs !== null && <EventStatusBadge dateMs={dateMs} />}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Fecha</dt>
            <dd className="text-foreground">
              {dateMs !== null ? formatDateTime(dateMs) : "Sin definir"}
            </dd>
          </div>
          {event.place && (
            <div>
              <dt className="text-xs text-muted">Lugar</dt>
              <dd className="text-foreground">{event.place}</dd>
            </div>
          )}
          {event.mapUrl && (
            <div>
              <dt className="text-xs text-muted">Mapa</dt>
              <dd>
                <a
                  href={event.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-darker hover:underline"
                >
                  Abrir ubicación ↗
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Galería</dt>
            <dd className="text-foreground">
              {photoCount > 0
                ? `${photoCount} ${photoCount === 1 ? "foto" : "fotos"}`
                : "Sin fotos"}
              {event.videoUrl ? " · 1 video" : ""}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-6 text-sm text-muted">
        Esta herramienta no maneja inscripciones: el público te contacta por WhatsApp con el botón
        “Consultar”.
      </p>

      <ToolManageFooter schoolId={schoolId} tool={tool} school={school} />
    </main>
  );
}
