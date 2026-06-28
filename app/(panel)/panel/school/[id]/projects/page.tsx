"use client";

/**
 * Project management for a school (/panel/school/[id]/projects).
 *
 * The board lists its crowdfunding projects (active first, settled ones under History).
 * Creating a new one happens on the dedicated "+ Nuevo" page (./new); each project's cover
 * and per-stage media are added afterwards on its edit page (./[pid]), since uploads persist
 * immediately. A project's public "Financiar" button stays off until the school is verified
 * (see the contribution rule), so the board can prepare projects ahead — hence the banner.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PanelNotice } from "@/components/ui/PanelNotice";
import { FlagIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";
import { CARD_COVER_ASPECT, CARD_COVER_SIZES } from "@/lib/layout";
import {
  getProjectsBySchool,
  getSchoolById,
  projectGoal,
} from "@/lib/firestore";
import type { ProjectDoc, SchoolDoc } from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

const LOADING_TEXT = "Cargando proyectos…";

/**
 * The page heading, rendered identically in every state (loading, error, missing school,
 * not-a-manager, loaded) so the title never shifts as content swaps in. Its first element is a
 * back link to the school's public profile (matching the Herramientas page), not wherever the
 * board came from. The subtitle takes the school name; during loading the school isn't known
 * yet, so the subtitle renders blank (a non-breaking space keeps the line height reserved) and
 * the h1 stays fixed.
 */
function Heading({
  schoolId,
  subtitle,
  action,
}: {
  schoolId: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <>
      <p className="text-sm">
        <BackLink href={`/school/${schoolId}`}>Principal</BackLink>
      </p>
      <header className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Proyectos
          </h1>
          {action}
        </div>
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      </header>
    </>
  );
}

/**
 * One compact project card, used by both the Active and History grids so the look stays
 * consistent. Extracted as a component (rather than a render fn closing over `id`) so its
 * identity is stable and there's no hook-ordering hazard. The WHOLE card is a link to the
 * project's control panel (mirroring how a tool grid card opens its manage page); editing
 * lives behind the panel's "Editar proyecto" button. Active projects show the live progress
 * bar; settled ones (completed/cancelled) show only the total raised — a partial bar next to
 * a "Completado" badge would read as contradictory.
 */
function ProjectRow({ schoolId, p }: { schoolId: string; p: ProjectDoc }) {
  const isActive = p.status === "active";
  return (
    <li>
      <Link
        href={`/panel/school/${schoolId}/projects/${p.id}/manage`}
        className={`group flex h-full flex-col overflow-hidden ${cardClass(
          "elevated",
          false,
        )} transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        {/* Cover band with an icon fallback so every cell reads uniformly in the grid; the
            settled-status chip overlays it (active renders nothing). */}
        <div className={`relative w-full bg-brand-tint ${CARD_COVER_ASPECT}`}>
          {p.coverUrl ? (
            <Image
              src={p.coverUrl}
              alt=""
              fill
              sizes={CARD_COVER_SIZES}
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full items-center justify-center text-brand-darker/30"
            >
              <FlagIcon className="h-8 w-8" />
            </span>
          )}
          {p.status !== "active" && (
            <span className="absolute left-2 top-2">
              <ProjectStatusBadge status={p.status} />
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div>
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-brand-darker">
              {p.title}
            </h3>
            <p className="text-xs text-muted">
              {p.stages.length} {p.stages.length === 1 ? "etapa" : "etapas"}
            </p>
          </div>
          <div className="mt-auto">
            {isActive ? (
              <ProjectProgress
                raised={p.raised}
                goal={projectGoal(p.stages)}
                currency={p.currency}
                contributorsCount={p.contributorsCount}
                compact
              />
            ) : (
              // Settled project: show only what it raised, no partial bar beside the badge.
              <p className="text-xs text-muted">
                Recaudó {formatMoney(p.raised, p.currency)}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function SchoolProjectsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Reusable load so "Reintentar" can re-run it; a network failure lands on the error
  // state (distinct from a real missing school, which is school === null after an OK load).
  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getProjectsBySchool(id)])
      .then(([s, p]) => {
        setSchool(s);
        setProjects(p);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  // Split the list once per data change instead of on every render. Active projects lead;
  // completed/cancelled fall to the History section.
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "active"),
    [projects],
  );
  const historyProjects = useMemo(
    () => projects.filter((p) => p.status !== "active"),
    [projects],
  );

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        {/* School not loaded yet → blank subtitle, but the h1 sits in its final position. */}
        <Heading schoolId={id} />
        <ul
          className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-hidden="true"
        >
          <li className="h-56 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-56 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-56 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
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
          No pudimos cargar los proyectos. Revisa tu conexión e intenta de
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
      <Heading
        schoolId={id}
        subtitle={school.name}
        action={
          <Link
            href={`/panel/school/${id}/projects/new`}
            className="btn btn-primary shrink-0 whitespace-nowrap"
          >
            + Nuevo proyecto
          </Link>
        }
      />

      {school.verificationStatus !== "verified" && (
        <p className="mt-6 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          {school.verificationStatus === "needs_reverification"
            ? "Editaste datos sensibles y la escuela quedó pendiente de re-verificación: el botón “Financiar” permanece apagado hasta que el equipo apruebe los cambios."
            : "Puedes preparar proyectos desde ya, pero el botón “Financiar” recién se activa cuando el equipo verifique la escuela."}{" "}
          <Link
            href={`/panel/school/${id}/edit`}
            className="font-medium underline underline-offset-2"
          >
            Completa los datos de la escuela
          </Link>{" "}
          para empezar.
        </p>
      )}

      <section className="mt-8">
        {/* Active projects lead; settled ones (completed/cancelled) go to a History
            section below — same split as the subscriptions/contributions queues. The
            counter labels exactly what it counts (active), like the sibling queues. */}
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Activos ({activeProjects.length})
        </h2>
        {projects.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<FlagIcon className="h-7 w-7" />}
              title="Todavía no creaste ningún proyecto"
              description="Crea tu primer proyecto con el botón “+ Nuevo”: define sus etapas y el costo de cada una."
            />
          </div>
        ) : activeProjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No tienes proyectos activos.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeProjects.map((p) => (
              <ProjectRow key={p.id} schoolId={id} p={p} />
            ))}
          </ul>
        )}
      </section>

      {historyProjects.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Historial
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {historyProjects.map((p) => (
              <ProjectRow key={p.id} schoolId={id} p={p} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
