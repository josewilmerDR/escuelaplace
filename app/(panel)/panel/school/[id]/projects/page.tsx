"use client";

/**
 * Project management for a school (/panel/school/[id]/projects).
 *
 * The board lists its crowdfunding projects and creates new ones (title, description,
 * currency, cost-justified stages). Media per stage and the cover are added on the per-
 * project edit page after creation, since uploads persist immediately. Creating a project
 * does NOT require verification — but its public "Financiar" button stays off until the
 * school is verified (see the contribution rule), so the board can prepare projects ahead.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import {
  StagesEditor,
  emptyStage,
  type StageDraft,
} from "@/components/projects/StagesEditor";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { FlagIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { CARD_COVER_ASPECT, CARD_COVER_SIZES } from "@/lib/layout";
import {
  createProject,
  getProjectsBySchool,
  getSchoolById,
  projectGoal,
} from "@/lib/firestore";
import {
  PROJECT_CURRENCIES,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_TITLE_MAX,
  type ProjectCurrency,
  type ProjectDoc,
  type SchoolDoc,
} from "@/types";

/** Lifecycle of the school + projects fetch the page depends on. */
type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando proyectos…";

/** Quiet, low-emphasis card action (the public link beside the lead "Editar"). */
const CHIP_ACTION =
  "inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground";

/**
 * The page heading, rendered identically in every state (loading, error, missing school,
 * not-a-manager, loaded) so the title never shifts as content swaps in. The subtitle takes
 * the school name; during loading the school isn't known yet, so the subtitle renders blank
 * (a non-breaking space keeps the line height reserved) and the h1 stays fixed.
 */
function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Proyectos
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
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
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Create-form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<ProjectCurrency>("CRC");
  const [stages, setStages] = useState<StageDraft[]>([emptyStage()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Heading />
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
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los proyectos. Revisá tu conexión e intentá de
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
        <Heading />
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
        <Heading subtitle={school.name} />
        {/* Not a system failure — the user simply lacks access here, so muted, not error. */}
        <p className="mt-4 text-sm text-muted">No administrás esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    // Whitespace-only passes the native `required`, so check the trimmed value.
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Ingresá el título del proyecto.");
      return;
    }
    const cleanStages = stages
      .map((s) => ({
        title: s.title.trim(),
        justification: s.justification.trim(),
        cost: s.cost,
      }))
      .filter((s) => s.title);
    if (cleanStages.length === 0) {
      setError("Agregá al menos una etapa con título.");
      return;
    }
    // Stage costs are the project goal; a total of 0 yields a degenerate progress bar.
    if (cleanStages.reduce((s, x) => s + (x.cost || 0), 0) <= 0) {
      setError("Cada etapa necesita un costo: la meta del proyecto no puede ser 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newId = await createProject(id, school.name, user.id, {
        title: trimmedTitle,
        description: description.trim(),
        currency,
        stages: cleanStages,
      });
      // Straight to the edit page (with ?created=1 so it can confirm the creation) so the
      // board can add the cover and per-stage photos.
      router.push(`/panel/school/${id}/projects/${newId}?created=1`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear el proyecto."));
      setSaving(false);
    }
  };

  return (
    <main>
      <Heading subtitle={school.name} />

      <SchoolPanelNav schoolId={id} current="projects" />

      {school.verificationStatus !== "verified" && (
        <p className="mt-6 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          {school.verificationStatus === "needs_reverification"
            ? "Editaste datos sensibles y la escuela quedó pendiente de re-verificación: el botón “Financiar” permanece apagado hasta que el equipo apruebe los cambios."
            : "Podés preparar proyectos desde ya, pero el botón “Financiar” recién se activa cuando el equipo verifique la escuela."}{" "}
          <Link
            href={`/panel/school/${id}/edit`}
            className="font-medium underline underline-offset-2"
          >
            Completá los datos de la escuela
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
              description="Creá tu primer proyecto con el formulario de abajo: definí sus etapas y el costo de cada una."
            />
          </div>
        ) : activeProjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No tenés proyectos activos.</p>
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

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Crear un proyecto
        </h2>
        <form
          onSubmit={onCreate}
          onInvalidCapture={spanishRequiredMessage}
          onInputCapture={clearValidationMessage}
          className="mt-3 flex flex-col gap-4"
        >
          <Field label="Título">
            <input
              type="text"
              required
              maxLength={PROJECT_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Ej.: Comprar tanque de almacenamiento de agua potable"
            />
          </Field>
          <Field label="Descripción">
            <textarea
              rows={3}
              maxLength={PROJECT_DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Contá qué se busca lograr y por qué importa."
            />
          </Field>
          <Field label="Moneda">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as ProjectCurrency)}
              className="input"
            >
              {PROJECT_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {/* Mirror the edit page's reason: the currency is frozen once money is in. */}
            <p className="mt-1 text-xs text-muted">
              No vas a poder cambiarla una vez que el proyecto reciba aportes.
            </p>
          </Field>

          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Etapas
            </h2>
            <p className="mb-2 text-xs text-muted">
              Cada etapa justifica su costo. La suma es la meta del proyecto.
            </p>
            <StagesEditor
              stages={stages}
              onChange={setStages}
              currency={currency}
            />
          </div>

          <FormError message={error} />

          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Creando…" : "Crear proyecto"}
          </button>
        </form>
      </section>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
