"use client";

/**
 * The project "control center", rendered by projects/[pid]/manage once the dispatcher has
 * loaded the school + project and checked that the viewer manages the school. It mirrors a
 * tool's manage panel: a read-first overview (live funding progress) whose actions are
 * collected behind a gear/settings menu inline with the "Volver a proyectos" back link —
 * edit, open/close the project, confirm aportes, and view the public page. Editing the
 * details/stages (and deleting it) lives behind the menu's "Editar proyecto" entry.
 *
 * `raised`/`contributorsCount` are function-maintained and only read here. PURELY
 * INFORMATIONAL — the platform never processes money.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { PageTitle } from "@/components/ui/PageTitle";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  BellIcon,
  CheckIcon,
  CogIcon,
  EyeIcon,
  FlagIcon,
  PencilIcon,
  XMarkIcon,
} from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import {
  getPendingContributionsBySchool,
  projectGoal,
  setProjectStatus,
} from "@/lib/firestore";
import type { ProjectDoc, SchoolDoc } from "@/types";

/** Spanish announcement for a status change, for the aria-live region. */
function statusAnnouncement(status: ProjectDoc["status"]): string {
  if (status === "completed") return "Proyecto marcado como completado.";
  if (status === "cancelled") return "Proyecto cancelado.";
  return "Proyecto reabierto.";
}

export function ProjectManagePanel({
  schoolId,
  school,
  project,
}: {
  schoolId: string;
  school: SchoolDoc;
  project: ProjectDoc;
}) {
  const pid = project.id;

  // Local status mirror so the menu reflects a change immediately without a refetch; the
  // doc's other fields (raised/contributorsCount/title) don't change from this surface.
  const [status, setStatus] = useState<ProjectDoc["status"]>(project.status);

  // The status action hits a Cloud Function; a busy gate stops a double-click firing twice.
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Status errors render below the progress; the change also announces via an aria-live
  // region for screen readers.
  const [riskError, setRiskError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // How many of this project's aportes await confirmation — a nudge badge on the menu's inbox
  // entry. The queue itself lives in the unified Actividad inbox; this only links out to it.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getPendingContributionsBySchool(schoolId)
      .then((contribs) => {
        if (!cancelled) {
          setPendingCount(contribs.filter((c) => c.projectId === pid).length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [schoolId, pid]);

  const onStatus = useCallback(
    async (next: ProjectDoc["status"]) => {
      setRiskError(null);
      setStatusMsg(null);
      setActionBusy(true);
      try {
        await setProjectStatus(schoolId, pid, next);
        setStatus(next);
        setStatusMsg(statusAnnouncement(next));
      } catch (err) {
        setRiskError(userErrorMessage(err, "No se pudo cambiar el estado."));
      } finally {
        setActionBusy(false);
      }
    },
    [schoolId, pid],
  );

  return (
    <main>
      <PageTitle
        backHref={`/panel/school/${schoolId}/projects`}
        backLabel="Volver a proyectos"
        title={project.title}
        subtitle={`Gestión del proyecto · ${school.name}`}
        // Status pill by the title (renders nothing while "active", so no empty slot).
        action={
          status !== "active" ? <ProjectStatusBadge status={status} /> : undefined
        }
        // All the panel's actions live in a gear menu inline with the back link.
        backAction={
          <ProjectActionsMenu
            schoolId={schoolId}
            projectId={pid}
            status={status}
            pendingCount={pendingCount}
            busy={actionBusy}
            onComplete={() => onStatus("completed")}
            onReopen={() => onStatus("active")}
            onCancel={() => setConfirmCancel(true)}
          />
        }
      />

      {/* Accessible-only announcement for a status change; no visual banner. */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMsg}
      </p>

      {/* Live progress (function-maintained raised/contributorsCount) on an inset card,
          the same block the public project page and the editor use. */}
      <Card variant="inset" className="mt-8">
        <ProjectProgress
          raised={project.raised}
          goal={projectGoal(project.stages)}
          currency={project.currency}
          contributorsCount={project.contributorsCount}
        />
      </Card>

      {/* A status-change failure surfaces here (the action that raised it lives in the menu). */}
      {riskError && (
        <p role="alert" className="mt-4 text-sm text-error">
          {riskError}
        </p>
      )}

      {/* Cancel asks first: it switches off the public "Financiar" button in one click. */}
      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar proyecto"
        confirmLabel="Cancelar proyecto"
        cancelLabel="Volver"
        busy={actionBusy}
        busyLabel="Cancelando…"
        onConfirm={async () => {
          await onStatus("cancelled");
          setConfirmCancel(false);
        }}
        onCancel={() => setConfirmCancel(false)}
      >
        <p>
          Cancelar oculta el botón “Financiar” de la página pública del
          proyecto, así nadie puede seguir aportando. Puedes reabrirlo más
          adelante.
        </p>
      </ConfirmDialog>
    </main>
  );
}

/**
 * The gear/settings menu that gathers every project action next to the back link: edit, the
 * status transitions (complete / cancel / reopen), the aportes inbox (with a pending badge),
 * and the public page. Mirrors the school's "Configurar" menu (SchoolManageBar): a disclosure
 * button toggling a `role="menu"` of links + action buttons, dismissed on outside click or
 * Escape. The destructive cancel opens a ConfirmDialog (owned by the panel); the others run
 * directly since they're reversible.
 */
function ProjectActionsMenu({
  schoolId,
  projectId,
  status,
  pendingCount,
  busy,
  onComplete,
  onReopen,
  onCancel,
}: {
  schoolId: string;
  projectId: string;
  status: ProjectDoc["status"];
  pendingCount: number;
  busy: boolean;
  onComplete: () => void;
  onReopen: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Standard popover dismissal: outside click or Escape, wired only while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Run an action item, then close the menu.
  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acciones del proyecto"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted ring-1 ring-border transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <CogIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/10"
        >
          <MenuLink
            href={`/panel/school/${schoolId}/projects/${projectId}`}
            icon={<PencilIcon className="h-4 w-4" />}
          >
            Editar proyecto
          </MenuLink>

          <div className="my-1 h-px bg-black/5" role="separator" />

          {status !== "completed" && (
            <MenuButton
              icon={<CheckIcon className="h-4 w-4" />}
              disabled={busy}
              onClick={() => run(onComplete)}
            >
              Marcar como completado
            </MenuButton>
          )}
          {status === "active" ? (
            <MenuButton
              icon={<XMarkIcon className="h-4 w-4" />}
              disabled={busy}
              onClick={() => run(onCancel)}
            >
              Cancelar proyecto
            </MenuButton>
          ) : (
            <MenuButton
              icon={<FlagIcon className="h-4 w-4" />}
              disabled={busy}
              onClick={() => run(onReopen)}
            >
              Reabrir proyecto
            </MenuButton>
          )}

          <div className="my-1 h-px bg-black/5" role="separator" />

          <MenuLink
            href={`/panel/school/${schoolId}/activity?filter=project_contribution`}
            icon={<BellIcon className="h-4 w-4" />}
          >
            Confirmar aportes
            {pendingCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-darker px-1.5 text-xs font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </MenuLink>
          <MenuLink
            href={`/school/${schoolId}/project/${projectId}`}
            icon={<EyeIcon className="h-4 w-4" />}
          >
            Ver página pública
          </MenuLink>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </Link>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface disabled:opacity-50"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  );
}
