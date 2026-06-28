"use client";

/**
 * The reinado control panel body, rendered by tools/[toolId]/manage once the dispatcher has loaded
 * the school + tool and checked that the viewer manages the school. It's the operations cockpit for
 * ONE reinado: a read-only config recap, the candidates' confirmed economic-support roll-up, the
 * live free-vote toggle and the embedded <PageantConsole> (follow votes, reveal, crown). Editing
 * lives behind the explicit "Editar reinado" button on the title row.
 *
 * PURELY INFORMATIONAL — the platform never processes money; the crown is the school's verdict.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageantConsole } from "@/components/tools/PageantConsole";
import { ToolManageHeading } from "@/components/tools/ToolManageHeading";
import { cardClass } from "@/components/ui/Card";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getCandidates,
  getProjectById,
  isGoalReached,
  projectGoal,
  projectProgress,
  setPageantFreeVoting,
  toolConfigOf,
} from "@/lib/firestore";
import type { CandidateDoc, ProjectDoc, SchoolDoc, ToolDoc } from "@/types";

export function PageantManagePanel({
  schoolId,
  school,
  tool: initialTool,
}: {
  schoolId: string;
  school: SchoolDoc;
  tool: ToolDoc;
}) {
  const toolId = initialTool.id;
  // Local copy so the free-voting toggle can mirror its write without a reload.
  const [tool, setTool] = useState<ToolDoc>(initialTool);
  // The reinado's destination project (PageantConfig.fundProjectId), if linked — its confirmed
  // `raised` is the headline recaudación this panel surfaces. Best-effort: a missing/deleted project
  // degrades to null without failing the whole load (mirrors the public page).
  const [fundProject, setFundProject] = useState<ProjectDoc | null>(null);
  // Candidate roster: its Cloud-Function-maintained `voteSupport` tally drives each candidacy's
  // confirmed economic-support amount (× the config's price per support unit).
  const [candidates, setCandidates] = useState<CandidateDoc[]>([]);
  // Live toggle of the free "simpatía" vote — an immediate write, separate from the (form-based) edit page.
  const [freeBusy, setFreeBusy] = useState(false);
  const [freeError, setFreeError] = useState<string | null>(null);

  const editHref = `/panel/school/${schoolId}/tools/${toolId}`;

  const load = useCallback(() => {
    const pageant = toolConfigOf(initialTool, "pageant");
    if (!pageant) return;
    // The candidate roster (its confirmed economic-support tallies) and the linked destination
    // project, in parallel. Best-effort — a failed read degrades to an empty roll-up / no project.
    Promise.all([
      getCandidates(schoolId, toolId).catch(() => []),
      pageant.fundProjectId
        ? getProjectById(schoolId, pageant.fundProjectId).catch(() => null)
        : Promise.resolve(null),
    ]).then(([roster, project]) => {
      setCandidates(roster);
      setFundProject(project);
    });
  }, [schoolId, toolId, initialTool]);

  useEffect(load, [load]);

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

  // Candidate economic-support roll-up. Each candidacy's confirmed amount is its `voteSupport`
  // count × the informational price per unit; the roster is ranked by that amount, highest first.
  // The board page may show the money figure (unlike the count-only public surface).
  const pricePerUnit = pageant.pricePerSupportUnit;
  const supportRanked = [...candidates]
    .map((c) => ({ candidate: c, amount: (c.voteSupport ?? 0) * pricePerUnit }))
    .sort(
      (a, b) =>
        b.amount - a.amount || a.candidate.name.localeCompare(b.candidate.name),
    );
  const totalCandidateSupport = supportRanked.reduce(
    (sum, r) => sum + r.amount,
    0,
  );

  // Destination-project funding figures (when linked + still resolvable).
  const fundGoal = fundProject ? projectGoal(fundProject.stages) : 0;
  const fundPercent = fundProject
    ? Math.round(projectProgress(fundProject.raised, fundGoal) * 100)
    : 0;
  const fundReached = fundProject
    ? isGoalReached(fundProject.raised, fundGoal)
    : false;

  // Flip the free-voting flag right away and mirror it into local state so the console's standings
  // (the sympathy axis) recompute without a reload. castPageantApplause re-checks the flag server-
  // side, so this can't enable bot votes on its own.
  const toggleFreeVoting = async () => {
    const next = !freeEnabled;
    setFreeBusy(true);
    setFreeError(null);
    try {
      await setPageantFreeVoting(schoolId, toolId, next);
      setTool((prev) => {
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
      <ToolManageHeading
        backHref={`/panel/school/${schoolId}/tools/manage/pageant`}
        backLabel="Volver a reinados"
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
                {fundProject
                  ? fundProject.title
                  : "Los apoyos alimentan un proyecto de la escuela."}
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

      {/* Apoyo económico a las candidaturas — what the reinado has raised. First the linked destination
          project ("Proyecto ↗" link + its confirmed raised + a slim bar), then each candidacy's
          confirmed economic support as a money amount (voteSupport × price/unit). */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Apoyo económico a las candidaturas
        </h2>
        <p className="mt-1 text-sm text-muted">
          Lo recaudado para el reinado. escuelaplace solo muestra los montos; nunca
          procesa el dinero.
        </p>

        {/* Destination project: the word "Proyecto" as a link (↗) + the raised amount + a slim bar. */}
        {pageant.fundProjectId &&
          (fundProject ? (
            <div className={`mt-4 ${cardClass("inset")}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link
                  href={`/panel/school/${schoolId}/projects/${fundProject.id}/manage`}
                  title={fundProject.title}
                  className="inline-flex items-center gap-1 font-medium text-brand-darker hover:underline"
                >
                  Proyecto
                  <ArrowUpRightIcon className="h-3.5 w-3.5" />
                </Link>
                <span className="tabular-nums text-foreground">
                  <span className="font-semibold">
                    {formatMoney(fundProject.raised, fundProject.currency)}
                  </span>{" "}
                  <span className="text-muted">recaudado</span>
                </span>
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-black/5"
                role="progressbar"
                aria-valuenow={fundPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Avance de la meta del proyecto"
              >
                <div
                  className={`h-full rounded-full ${fundReached ? "bg-success" : "bg-brand"}`}
                  style={{ width: `${fundPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-muted">
                Meta {formatMoney(fundGoal, fundProject.currency)} · {fundPercent}%
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              El proyecto vinculado ya no está disponible. Revisa la configuración del
              reinado.
            </p>
          ))}

        {/* Candidaturas — name + the confirmed economic-support amount, ranked highest first. */}
        {candidates.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            Aún no hay candidaturas. Agrégalas desde la edición del reinado.
          </p>
        ) : (
          <div className="mt-6">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Candidaturas
            </h3>
            <ol className="mt-3 flex flex-col gap-2">
              {supportRanked.map(({ candidate, amount }, i) => (
                <li
                  key={candidate.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                >
                  <span className="min-w-0 text-foreground">
                    <span className="tabular-nums text-muted">{i + 1}.</span>{" "}
                    {candidate.name}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(amount, pageant.currency)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs tabular-nums text-muted">
              Total en apoyo a candidaturas:{" "}
              {formatMoney(totalCandidateSupport, pageant.currency)}
            </p>
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
          <PageantConsole schoolId={schoolId} tool={tool} />
        </div>
      </section>

      {/* Quick links to the surfaces this panel doesn't own. */}
      <section className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6">
        <Link href={`/panel/school/${schoolId}/activity`} className="btn btn-outline">
          Confirmar apoyos
        </Link>
        <Link href={`/school/${schoolId}/tool/${toolId}`} className="btn btn-outline">
          Ver página pública
        </Link>
      </section>
    </main>
  );
}
