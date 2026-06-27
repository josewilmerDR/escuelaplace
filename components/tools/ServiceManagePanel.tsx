"use client";

/**
 * The "Servicios" (service) control center, rendered by tools/[toolId]/manage once the dispatcher has
 * loaded the school + tool and checked that the viewer manages the school. A service is config-only —
 * no orders, no reservations, nothing live to follow (the only public action is a WhatsApp consult) —
 * so this panel is a READ-ONLY overview: a config recap so the board sees the setup at a glance, plus
 * the public/share/consult footer and the "Editar servicio" button on the title row. PURELY
 * INFORMATIONAL — the platform never processes money.
 */
import Link from "next/link";
import { ToolManageFooter } from "@/components/tools/ToolManageFooter";
import { ToolManageHeading } from "@/components/tools/ToolManageHeading";
import { cardClass } from "@/components/ui/Card";
import { formatMoney } from "@/lib/format";
import { toolConfigOf } from "@/lib/firestore";
import { SERVICE_MODALITIES, SERVICE_MODALITY_LABELS } from "@/types";
import type { SchoolDoc, ToolDoc } from "@/types";

export function ServiceManagePanel({
  schoolId,
  school,
  tool,
}: {
  schoolId: string;
  school: SchoolDoc;
  tool: ToolDoc;
}) {
  const toolId = tool.id;
  const service = toolConfigOf(tool, "service")!;
  // A "Servicios" tool is a single service: its name/description are the tool's title/description,
  // so the recap reads the price/modalities/availability/media from the first catalog entry.
  const item = service.services[0];

  const priceLabel =
    item && typeof item.price === "number"
      ? `${item.priceFrom ? "Desde " : ""}${formatMoney(item.price, service.currency)}`
      : "A consultar";
  // Modalities in their canonical display order (the editor stores them as a set).
  const modalities = SERVICE_MODALITIES.filter((m) =>
    item?.modalities?.includes(m),
  ).map((m) => SERVICE_MODALITY_LABELS[m]);
  const photoCount = item?.photos?.length ?? 0;

  return (
    <main>
      <ToolManageHeading
        backHref={`/panel/school/${schoolId}/tools/manage/service`}
        backLabel="Volver a servicios"
        title={tool.title}
        subtitle={`Gestión del servicio · ${school.name}`}
        action={
          <Link
            href={`/panel/school/${schoolId}/tools/${toolId}`}
            className="btn btn-outline shrink-0"
          >
            Editar servicio
          </Link>
        }
      />

      {/* Read-only configuration recap: the board sees the setup at a glance WITHOUT entering the
          editor. */}
      <section className={`mt-8 ${cardClass("inset")}`}>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Configuración
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Precio</dt>
            <dd className="text-foreground">{priceLabel}</dd>
          </div>
          {modalities.length > 0 && (
            <div>
              <dt className="text-xs text-muted">Modalidad</dt>
              <dd className="text-foreground">{modalities.join(" · ")}</dd>
            </div>
          )}
          {item?.availability && (
            <div>
              <dt className="text-xs text-muted">Disponibilidad</dt>
              <dd className="text-foreground">{item.availability}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Fotos</dt>
            <dd className="text-foreground">
              {photoCount > 0
                ? `${photoCount} ${photoCount === 1 ? "foto" : "fotos"}`
                : "Sin fotos"}
              {item?.videoUrl ? " · 1 video" : ""}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-6 text-sm text-muted">
        Esta herramienta no maneja pedidos: el público te contacta por WhatsApp con el botón
        “Consultar”.
      </p>

      <ToolManageFooter schoolId={schoolId} tool={tool} school={school} />
    </main>
  );
}
