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

/** Quiet, low-emphasis card action (the public link beside the lead "Editar"). */
const CHIP_ACTION =
  "inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground";

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
 * One project row, used by both the Active and History sections so the look stays
 * consistent. Extracted as a component (rather than a render fn closing over `id`) so its
 * identity is stable and there's no hook-ordering hazard. Active projects show the live
 * progress bar; settled ones (completed/cancelled) show only the total raised — a partial
 * bar next to a "Completado" badge would read as contradictory.
 */
function ProjectRow({ schoolId, p }: { schoolId: string; p: ProjectDoc }) {
  const isActive = p.status === "active";
  return (
    // Elevated calm-depth card per project (ring + soft shadow, no hard border). Padding
    // is opted out so an optional cover can run edge-to-edge across the top.
    <li className={`${cardClass("elevated", false)} overflow-hidden`}>
      {p.coverUrl && (
        // Discreet cover band atop the card; decorative since the title sits right below.
        <span
          className={`relative block w-full bg-surface ${CARD_COVER_ASPECT}`}
        >
          <Image
            src={p.coverUrl}
            alt=""
            fill
            sizes={CARD_COVER_SIZES}
            className="object-cover"
          />
        </span>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold tracking-tight text-foreground">
              {p.title}
            </p>
            <p className="text-xs text-muted">
              {p.stages.length} {p.stages.length === 1 ? "etapa" : "etapas"}
            </p>
          </div>
          <ProjectStatusBadge status={p.status} />
        </div>
        <div className="mt-3">
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
        {/* One solid lead action; the public link is a quiet chip. A thin divider
            sets the action shelf apart from the card body. */}
        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-4 text-sm">
          <Link
            href={`/panel/school/${schoolId}/projects/${p.id}`}
            className="btn btn-primary mr-1"
          >
            Editar
          </Link>
          <Link href={`/school/${schoolId}/project/${p.id}`} className={CHIP_ACTION}>
            Ver público
          </Link>
        </div>
      </div>
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
        <ul className="mt-8 flex flex-col gap-4" aria-hidden="true">
          <li className="h-32 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-32 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
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
      <main>
        <Heading schoolId={id} />
        <p className="mt-4 text-sm text-muted">Escuela no encontrada.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager = isPageManager(school, user);

  if (!isManager) {
    return (
      <main>
        <Heading schoolId={id} subtitle={school.name} />
        {/* Not a system failure — the user simply lacks access here, so muted, not error. */}
        <p className="mt-4 text-sm text-muted">No administras esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
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
            + Nuevo
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
          <ul className="mt-4 flex flex-col gap-4">
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
          <ul className="mt-4 flex flex-col gap-4">
            {historyProjects.map((p) => (
              <ProjectRow key={p.id} schoolId={id} p={p} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
