"use client";

/**
 * Per-reinado management / control panel (/panel/school/[id]/tools/[toolId]/manage).
 *
 * The DEFAULT landing when the board clicks a reinado card (ToolGridCard routes pageant tools here,
 * every other kind straight to its edit page). It's the operations cockpit for ONE reinado: follow
 * the votes live, decide whether to reveal them to the public ("retransmitir"), drive the gala and
 * crown — all through the embedded <PageantConsole>. Editing (config + the candidate roster + the
 * risk zone) lives behind the explicit "Editar reinado" button on the title row, so the board never
 * lands on the editor by accident and can't nudge a candidate's data mid-gala.
 *
 * Route note: distinct from tools/manage/[type] (the per-KIND list). This is tools/[TOOLID]/manage —
 * the per-INSTANCE panel; the segments don't collide in Next's router.
 *
 * Pageant-only: a non-pageant toolId redirects to that tool's edit page. PURELY INFORMATIONAL — the
 * platform never processes money; the crown is the school's verdict.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageantConsole } from "@/components/tools/PageantConsole";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { userErrorMessage } from "@/lib/errors";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getSchoolById,
  getToolById,
  setPageantFreeVoting,
  toolConfigOf,
} from "@/lib/firestore";
import type { SchoolDoc, ToolDoc } from "@/types";

type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando el reinado…";

/** Title row with the inline "Editar reinado" action, mirroring the per-kind manage page Heading. */
function Heading({
  schoolId,
  title,
  subtitle,
  action,
}: {
  schoolId: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <>
      <p className="text-sm">
        <BackLink href={`/panel/school/${schoolId}/tools/manage/pageant`}>
          Volver a reinados
        </BackLink>
      </p>
      <header className="mt-3">
        {/* Title and the edit button share one row. The button is shrink-0 and the title min-w-0
            (it wraps instead), so on mobile the button never collapses to a second row. */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      </header>
    </>
  );
}

export default function PageantManagePage() {
  const { id, toolId } = useParams<{ id: string; toolId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tool, setTool] = useState<ToolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  // Live toggle of the free "simpatía" vote — an immediate write, separate from the (form-based) edit page.
  const [freeBusy, setFreeBusy] = useState(false);
  const [freeError, setFreeError] = useState<string | null>(null);

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

  // This panel is only for reinados; any other kind (or a missing tool) belongs on the generic
  // edit page. Redirect once loaded so a mistyped/stale link still lands somewhere sensible.
  useEffect(() => {
    if (loadState === "loaded" && tool && tool.type !== "pageant") {
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
        <Heading schoolId={id} title="Gestión del reinado" />
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
        <Heading schoolId={id} title="Gestión del reinado" />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar el reinado. Revisa tu conexión e intenta de nuevo.
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
        <Heading schoolId={id} title="Gestión del reinado" />
        <p className="mt-4 text-sm text-muted">
          {!school ? "Escuela no encontrada." : "Reinado no encontrado."}
        </p>
        <p className="mt-6 text-sm">
          <BackLink href={`/panel/school/${id}/tools/manage/pageant`}>
            Volver a reinados
          </BackLink>
        </p>
      </main>
    );
  }

  // A non-pageant tool is mid-redirect (effect above) — keep the skeleton, never the wrong UI.
  if (tool.type !== "pageant") {
    return (
      <main>
        <Heading schoolId={id} title="Gestión del reinado" subtitle={school.name} />
        <div
          className="mt-8 h-64 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
          aria-hidden="true"
        />
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
        <Heading schoolId={id} title="Gestión del reinado" subtitle={school.name} />
        <p className="mt-4 text-sm text-muted">No administras esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const pageant = toolConfigOf(tool, "pageant")!;
  const opensMs = pageant.opensAt ? pageant.opensAt.toMillis() : null;
  const closesMs = pageant.closesAt ? pageant.closesAt.toMillis() : null;
  const windowLabel =
    opensMs && closesMs
      ? `${formatDate(opensMs)} – ${formatDate(closesMs)}`
      : closesMs
        ? `Hasta ${formatDate(closesMs)}`
        : opensMs
          ? `Desde ${formatDate(opensMs)}`
          : "Sin definir";
  const { jury, support, sympathy } = pageant.crownFormula;
  const freeEnabled = pageant.freeVotingEnabled;

  // Flip the free-voting flag right away and mirror it into local state so the console's standings
  // (the sympathy axis) recompute without a reload. castPageantApplause re-checks the flag server-
  // side, so this can't enable bot votes on its own.
  const toggleFreeVoting = async () => {
    const next = !freeEnabled;
    setFreeBusy(true);
    setFreeError(null);
    try {
      await setPageantFreeVoting(id, toolId, next);
      setTool((prev) => {
        if (!prev) return prev;
        const cfg = toolConfigOf(prev, "pageant");
        return cfg
          ? { ...prev, config: { ...cfg, freeVotingEnabled: next } }
          : prev;
      });
    } catch (err) {
      setFreeError(userErrorMessage(err, "No se pudo cambiar el voto libre."));
    } finally {
      setFreeBusy(false);
    }
  };

  return (
    <main>
      <Heading
        schoolId={id}
        title={tool.title}
        subtitle={`Gestión del reinado · ${school.name}`}
        action={
          <Link href={editHref} className="btn btn-outline shrink-0">
            Editar reinado
          </Link>
        }
      />

      {/* Read-only configuration recap: the board sees the setup at a glance WITHOUT entering the
          editor — reinforcing that this panel is for running the reinado, not changing it. */}
      <section className={`mt-8 ${cardClass("inset")}`}>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Configuración
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {pageant.cause && (
            <div>
              <dt className="text-xs text-muted">Pro fondos</dt>
              <dd className="text-foreground">{pageant.cause}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Votación</dt>
            <dd className="text-foreground">{windowLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Unidad de apoyo</dt>
            <dd className="text-foreground">
              {formatMoney(pageant.pricePerSupportUnit, pageant.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pesos de la corona</dt>
            <dd className="text-foreground">
              Jurado {jury}% · Apoyo {support}%
              {pageant.freeVotingEnabled ? ` · Simpatía ${sympathy}%` : ""}
            </dd>
          </div>
          {pageant.fundProjectId && (
            <div>
              <dt className="text-xs text-muted">Destino</dt>
              <dd className="text-foreground">
                Los apoyos alimentan un proyecto de la escuela.
              </dd>
            </div>
          )}
        </dl>
        {pageant.criteria && (
          <div className="mt-4">
            <dt className="text-xs text-muted">Criterios</dt>
            <dd className="mt-1 whitespace-pre-line text-sm text-muted">
              {pageant.criteria}
            </dd>
          </div>
        )}
      </section>

      {/* Free "simpatía" vote — a live on/off control. It changes how the suggested standings are
          computed (the sympathy axis), so it sits right above the console. */}
      <section className="mt-10">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Voto libre de simpatía
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Deja que cualquiera vote sin cuenta (una vez por dispositivo). Mientras está
              apagado, la simpatía no pesa en la corona ni se muestra el aplauso público.
            </p>
            <p className="mt-1 text-xs">
              Estado:{" "}
              <span
                className={
                  freeEnabled
                    ? "font-medium text-brand-darker"
                    : "font-medium text-muted"
                }
              >
                {freeEnabled ? "Activado" : "Apagado"}
              </span>
            </p>
            {freeError && (
              <p role="alert" className="mt-2 text-xs text-error">
                {freeError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={toggleFreeVoting}
            disabled={freeBusy}
            aria-pressed={freeEnabled}
            className={`shrink-0 ${freeEnabled ? "btn btn-outline" : "btn btn-primary"}`}
          >
            {freeBusy
              ? "Guardando…"
              : freeEnabled
                ? "Apagar voto libre"
                : "Encender voto libre"}
          </button>
        </div>
      </section>

      {/* Live control: follow the votes, reveal to the public, drive the gala, crown. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Coronación en vivo
        </h2>
        <p className="mt-1 text-sm text-muted">
          Dirige la gala: las posiciones se actualizan solas a medida que se confirman los
          apoyos. Tú decides cuándo revelarlas al público y a quién coronar.
        </p>
        <div className="mt-4">
          <PageantConsole schoolId={id} tool={tool} />
        </div>
      </section>

      {/* Quick links to the surfaces this panel doesn't own. */}
      <section className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6">
        <Link
          href={`/panel/school/${id}/activity`}
          className="btn btn-outline"
        >
          Confirmar apoyos
        </Link>
        <Link href={`/school/${id}/tool/${toolId}`} className="btn btn-outline">
          Ver página pública
        </Link>
      </section>
    </main>
  );
}
