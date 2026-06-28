"use client";

/**
 * Project management / control panel (/panel/school/[id]/projects/[pid]/manage).
 *
 * The DEFAULT landing when the board opens a project from the list — it mirrors a tool's
 * manage page (tools/[toolId]/manage): a thin loader that fetches the project + school, gates
 * on management access, then renders the <ProjectManagePanel> control center. Editing the
 * project's details/stages lives behind an explicit "Editar proyecto" button inside the panel,
 * so the board never lands on the editor by accident.
 *
 * PURELY INFORMATIONAL — the platform never processes money.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectManagePanel } from "@/components/projects/ProjectManagePanel";
import { PanelNotice } from "@/components/ui/PanelNotice";
import { getProjectById, getSchoolById } from "@/lib/firestore";
import type { ProjectDoc, SchoolDoc } from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

const LOADING_TEXT = "Cargando el proyecto…";

/** Minimal heading used only for the loader's own loading / error / access states. */
function Heading() {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Gestión del proyecto
      </h1>
      <p className="mt-1 text-sm text-muted"> </p>
    </header>
  );
}

export default function ProjectManagePage() {
  const { id, pid } = useParams<{ id: string; pid: string }>();
  const { user } = useAuth();

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const load = useCallback(() => {
    Promise.all([getProjectById(id, pid), getSchoolById(id)])
      .then(([p, s]) => {
        setProject(p);
        setSchool(s);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id, pid]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading />
        <div
          className="mt-8 h-64 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
          aria-hidden="true"
        />
        <p className="sr-only" role="status">
          {LOADING_TEXT}
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar el proyecto. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school || !project) {
    return (
      <PanelNotice
        heading={<Heading />}
        backHref={`/panel/school/${id}/projects`}
        backLabel="Volver a proyectos"
      >
        {!school ? "Escuela no encontrada." : "Proyecto no encontrado."}
      </PanelNotice>
    );
  }

  if (!isPageManager(school, user)) {
    return (
      <PanelNotice heading={<Heading />}>
        No administras esta escuela.
      </PanelNotice>
    );
  }

  return <ProjectManagePanel schoolId={id} school={school} project={project} />;
}
