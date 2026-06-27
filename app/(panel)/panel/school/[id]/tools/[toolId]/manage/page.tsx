"use client";

/**
 * Per-instance management / control panel (/panel/school/[id]/tools/[toolId]/manage).
 *
 * The DEFAULT landing when the board clicks a tool card that HAS a control panel (ToolGridCard
 * routes pageant + raffle here, every other kind straight to its edit page). This file is the thin
 * dispatcher: it loads the school + tool, gates on management access, then renders the kind-specific
 * panel (<PageantManagePanel> / <RaffleManagePanel>). Editing lives behind an explicit "Editar …"
 * button inside each panel, so the board never lands on the editor by accident.
 *
 * Route note: distinct from tools/manage/[type] (the per-KIND list). This is tools/[TOOLID]/manage —
 * the per-INSTANCE panel; the segments don't collide in Next's router.
 *
 * PURELY INFORMATIONAL — the platform never processes money.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageantManagePanel } from "@/components/tools/PageantManagePanel";
import { RaffleManagePanel } from "@/components/tools/RaffleManagePanel";
import { BackLink } from "@/components/ui/BackLink";
import { getSchoolById, getToolById } from "@/lib/firestore";
import type { SchoolDoc, ToolDoc } from "@/types";

type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando la herramienta…";

/** The kinds that have a dedicated control panel here; any other kind belongs on the edit page. */
const MANAGED_KINDS = new Set<ToolDoc["type"]>(["pageant", "raffle"]);

/** Minimal heading used only for the dispatcher's own loading / error / access states. */
function Heading({ title }: { title: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted"> </p>
    </header>
  );
}

export default function ToolManagePage() {
  const { id, toolId } = useParams<{ id: string; toolId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tool, setTool] = useState<ToolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const editHref = `/panel/school/${id}/tools/${toolId}`;

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getToolById(id, toolId)])
      .then(([s, t]) => {
        setSchool(s);
        setTool(t);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id, toolId]);

  useEffect(load, [load]);

  // A kind without a dedicated panel (or a missing tool) belongs on the generic edit page. Redirect
  // once loaded so a mistyped/stale link still lands somewhere sensible.
  useEffect(() => {
    if (loadState === "loaded" && tool && !MANAGED_KINDS.has(tool.type)) {
      router.replace(editHref);
    }
  }, [loadState, tool, router, editHref]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading title="Gestión de la herramienta" />
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
        <Heading title="Gestión de la herramienta" />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la herramienta. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school || !tool) {
    return (
      <main>
        <Heading title="Gestión de la herramienta" />
        <p className="mt-4 text-sm text-muted">
          {!school ? "Escuela no encontrada." : "Herramienta no encontrada."}
        </p>
        <p className="mt-6 text-sm">
          <BackLink href={`/panel/school/${id}/tools`}>Volver a herramientas</BackLink>
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
        <Heading title="Gestión de la herramienta" />
        <p className="mt-4 text-sm text-muted">No administras esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  if (tool.type === "pageant") {
    return <PageantManagePanel schoolId={id} school={school} tool={tool} />;
  }
  if (tool.type === "raffle") {
    return <RaffleManagePanel schoolId={id} school={school} tool={tool} />;
  }

  // An unmanaged kind is mid-redirect (effect above) — keep the skeleton, never the wrong UI.
  return (
    <main>
      <Heading title="Gestión de la herramienta" />
      <div
        className="mt-8 h-64 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
        aria-hidden="true"
      />
    </main>
  );
}
