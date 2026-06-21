"use client";

/**
 * Tool ("Herramientas") hub for a school (/panel/school/[id]/tools).
 *
 * A pure catalog. It leads with one card per kind (rifa, venta, bingo…) to start a new
 * activity — that's what a board navigating here is after — and below shows the activities
 * already created, as a compact card grid (Activas / Ocultas). Each create card links to the
 * dedicated creation page (./new?type=…); each created-tool card links to its edit page. A
 * tool shows as a card on the school's public "Principal" page. PURELY INFORMATIONAL — the
 * platform never processes money.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { ToolTypeMenu } from "@/components/tools/ToolTypeMenu";
import { Badge } from "@/components/ui/Badge";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { WrenchIcon } from "@/components/ui/icons";
import { CARD_COVER_ASPECT } from "@/lib/layout";
import { toolTypeMeta } from "@/lib/tools/registry";
import { getSchoolById, getToolsBySchool } from "@/lib/firestore";
import { type SchoolDoc, type ToolDoc } from "@/types";

/** Lifecycle of the school + tools fetch the page depends on. */
type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando herramientas…";

/** The compact created-tool grid: 2 per row on phones, up to 6 on desktop. */
const TOOL_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

/** Cover `sizes` for a grid cell — at most ~150px wide on desktop, ~half the row on phones. */
const TOOL_GRID_SIZES = "(min-width: 1024px) 150px, (min-width: 640px) 30vw, 50vw";

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

/**
 * Compact management card for one created tool, shared by the Activas and Ocultas grids. The
 * whole card links to the tool's edit page (the board's primary action here); the cover falls
 * back to the kind's icon (mirroring the public ToolCard) and a "Oculta" chip overlays a hidden
 * tool. Kept small so the grid packs many at a glance.
 */
function ToolGridCard({ schoolId, tool }: { schoolId: string; tool: ToolDoc }) {
  const Icon = toolTypeMeta(tool.type).icon;
  return (
    <li>
      <Link
        href={`/panel/school/${schoolId}/tools/${tool.id}`}
        className={`group flex h-full flex-col overflow-hidden ${cardClass(
          "elevated",
          false,
        )} transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <div className={`relative w-full bg-brand-tint ${CARD_COVER_ASPECT}`}>
          {tool.coverUrl ? (
            <Image
              src={tool.coverUrl}
              alt=""
              fill
              sizes={TOOL_GRID_SIZES}
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full items-center justify-center text-brand-darker/30"
            >
              <Icon className="h-8 w-8" />
            </span>
          )}
          {tool.status === "inactive" && (
            <span className="absolute left-2 top-2">
              <Badge tone="neutral">Oculta</Badge>
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-brand-darker">
            {tool.title}
          </h3>
          <div className="mt-auto">
            <ToolTypeBadge type={tool.type} />
          </div>
        </div>
      </Link>
    </li>
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

  const activeTools = useMemo(
    () => tools.filter((t) => t.status === "active"),
    [tools],
  );
  const hiddenTools = useMemo(
    () => tools.filter((t) => t.status !== "active"),
    [tools],
  );

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading schoolId={id} />
        <ul className={`mt-8 ${TOOL_GRID}`} aria-hidden="true">
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <li
              key={k}
              className={`${CARD_COVER_ASPECT} animate-pulse rounded-2xl bg-surface ring-1 ring-black/5`}
            />
          ))}
        </ul>
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
          No pudimos cargar las herramientas. Revisá tu conexión e intentá de
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
      <main>
        <Heading schoolId={id} />
        <p className="mt-4 text-sm text-muted">Escuela no encontrada.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return (
      <main>
        <Heading schoolId={id} subtitle={school.name} />
        <p className="mt-4 text-sm text-muted">No administrás esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  return (
    <main>
      <Heading schoolId={id} subtitle={school.name} />

      <p className="mt-6 text-sm text-muted">
        Usá las herramientas para crear o anunciar una actividad puntual:
        rifas, ventas, bingos, servicios, visitas guiadas… Quienes visiten la
        página de tu escuela las verán en la pestaña “Principal” y podrán
        interactuar con ellas.
      </p>

      {/* Create options first — that's what a board navigating here is after. */}
      <section className="mt-8">
        <ToolTypeMenu schoolId={id} />
      </section>

      {/* Bingo decks (mazos): reusable lotes of cartones, shared across a school's bingos. */}
      <p className="mt-6 text-sm">
        <Link
          href={`/panel/school/${id}/bingo-decks`}
          className="font-medium text-brand-darker hover:underline"
        >
          Mazos de bingo →
        </Link>
        <span className="ml-2 text-muted">
          Lotes de cartones reutilizables para tus bingos.
        </span>
      </p>

      {/* Then the activities already created, compact so many fit at a glance. */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Activas ({activeTools.length})
        </h2>
        {tools.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<WrenchIcon className="h-7 w-7" />}
              title="Todavía no creaste ninguna herramienta"
              description="Elegí un tipo de actividad arriba para crear la primera: una rifa, una venta, un bingo…"
            />
          </div>
        ) : activeTools.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No tenés herramientas activas.</p>
        ) : (
          <ul className={`mt-4 ${TOOL_GRID}`}>
            {activeTools.map((t) => (
              <ToolGridCard key={t.id} schoolId={id} tool={t} />
            ))}
          </ul>
        )}
      </section>

      {hiddenTools.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Ocultas
          </h2>
          <ul className={`mt-4 ${TOOL_GRID}`}>
            {hiddenTools.map((t) => (
              <ToolGridCard key={t.id} schoolId={id} tool={t} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
