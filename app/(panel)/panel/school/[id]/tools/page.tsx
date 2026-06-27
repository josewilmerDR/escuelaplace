"use client";

/**
 * Tool ("Herramientas") hub for a school (/panel/school/[id]/tools).
 *
 * A pure DIRECTORY of tool kinds (rifa, venta, bingo…). One card per kind, each offering two
 * actions: "Crear" (jump to the kind's creation form) and "Administrar" (the kind's manage page,
 * which lists every tool of that kind and lets the board edit/hide/delete them). The card also
 * shows how many of that kind already exist. The per-kind listing/editing lives on the manage
 * page, not here. A tool shows as a card on the school's public "Principal" page. PURELY
 * INFORMATIONAL — the platform never processes money.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ToolTypeMenu } from "@/components/tools/ToolTypeMenu";
import { BackLink } from "@/components/ui/BackLink";
import { PanelNotice } from "@/components/ui/PanelNotice";
import { TOOL_TYPE_LIST, toolTypeMeta } from "@/lib/tools/registry";
import { getSchoolById, getToolsBySchool } from "@/lib/firestore";
import { type SchoolDoc, type ToolDoc, type ToolType } from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

const LOADING_TEXT = "Cargando herramientas…";

/** The kind-directory grid: 1 per row on phones, up to 3 on desktop. */
const KIND_GRID = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

/**
 * Page heading, rendered identically in every state so the title never shifts. The back link
 * is the page's first element: it always returns to the school's public profile (not wherever
 * the board happened to come from). The cross-section nav (Actividad/Editar/Proyectos) is
 * intentionally not shown here — from a tool the board's expected move is back, not sideways.
 */
function Heading({ schoolId, subtitle }: { schoolId: string; subtitle?: string }) {
  return (
    <>
      <p className="text-sm">
        <BackLink href={`/school/${schoolId}`}>Principal</BackLink>
      </p>
      <header className="mt-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Herramientas
        </h1>
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      </header>
    </>
  );
}

export default function SchoolToolsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tools, setTools] = useState<ToolDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getToolsBySchool(id)])
      .then(([s, t]) => {
        setSchool(s);
        setTools(t);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  // How many created tools each kind has, for the directory's per-card count badge. Bucketed by
  // toolTypeMeta(...).key so legacy/unknown types fold into "Otro" — matching how the manage page
  // filters, so the count and the listed items agree.
  const counts = useMemo(() => {
    const acc = Object.fromEntries(
      TOOL_TYPE_LIST.map((t) => [t.key, 0]),
    ) as Record<ToolType, number>;
    for (const tool of tools) {
      const key = toolTypeMeta(tool.type).key;
      acc[key] = (acc[key] ?? 0) + 1;
    }
    return acc;
  }, [tools]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading schoolId={id} />
        <div className={`mt-8 ${KIND_GRID}`} aria-hidden="true">
          {TOOL_TYPE_LIST.map((t) => (
            <div
              key={t.key}
              className="h-36 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
            />
          ))}
        </div>
        <p className="sr-only" role="status">
          {LOADING_TEXT}
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading schoolId={id} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar las herramientas. Revisa tu conexión e intenta de
          nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <PanelNotice heading={<Heading schoolId={id} />}>
        Escuela no encontrada.
      </PanelNotice>
    );
  }

  const isManager = isPageManager(school, user);

  if (!isManager) {
    return (
      <PanelNotice heading={<Heading schoolId={id} subtitle={school.name} />}>
        No administras esta escuela.
      </PanelNotice>
    );
  }

  return (
    <main>
      <Heading schoolId={id} subtitle={school.name} />

      <p className="mt-6 text-sm text-muted">
        Cada herramienta te deja crear o anunciar una actividad puntual: rifas,
        ventas, bingos, servicios, visitas guiadas… Entra a una tarjeta para crear
        nuevas o administrar las que ya tienes. Quienes visiten la página de tu
        escuela las verán en la pestaña “Principal”.
      </p>

      <section className="mt-8">
        <ToolTypeMenu schoolId={id} counts={counts} />
      </section>
    </main>
  );
}
