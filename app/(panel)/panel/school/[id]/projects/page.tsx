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
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import {
  StagesEditor,
  emptyStage,
  type StageDraft,
} from "@/components/projects/StagesEditor";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
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

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading")
    return <p className="text-sm text-muted">Cargando…</p>;

  if (loadState === "error") {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Proyectos
        </h1>
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

  if (!school)
    return <p className="text-sm text-muted">Escuela no encontrada.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return <p className="text-sm text-error">No administrás esta escuela.</p>;
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
      setError("Cada etapa necesita un costo: la meta del proyecto no puede ser ₡0.");
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
      // Straight to the edit page so the board can add the cover and per-stage photos.
      router.push(`/panel/school/${id}/projects/${newId}`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear el proyecto."));
      setSaving(false);
    }
  };

  // Active projects lead; completed/cancelled fall to the History section.
  const activeProjects = projects.filter((p) => p.status === "active");
  const historyProjects = projects.filter((p) => p.status !== "active");

  // Same card for both sections (active + history) to keep the look consistent.
  const renderProjectCard = (p: ProjectDoc) => (
    // Elevated calm-depth card per project (ring + soft shadow, no hard border).
    <li
      key={p.id}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
    >
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
        <ProjectProgress
          raised={p.raised}
          goal={projectGoal(p.stages)}
          currency={p.currency}
          contributorsCount={p.contributorsCount}
          compact
        />
      </div>
      {/* One solid lead action; the public link is a quiet chip. A thin divider
          sets the action shelf apart from the card body. */}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-4 text-sm">
        <Link
          href={`/panel/school/${id}/projects/${p.id}`}
          className="btn btn-primary mr-1"
        >
          Editar
        </Link>
        <Link
          href={`/school/${id}/project/${p.id}`}
          // min-h-10 lifts the quiet chip to a 40px tap target without changing its look.
          className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          Ver público
        </Link>
      </div>
    </li>
  );

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Proyectos
      </h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      {school.verificationStatus !== "verified" && (
        <p className="mt-6 rounded-xl bg-warning-tint p-3 text-sm text-warning ring-1 ring-warning/10">
          Podés preparar proyectos desde ya, pero el botón “Financiar” recién se
          activa cuando el equipo verifique la escuela.{" "}
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
            section below — same split as the subscriptions/contributions queues. */}
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tus proyectos ({activeProjects.length})
        </h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no creaste ningún proyecto.
          </p>
        ) : activeProjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No tenés proyectos activos.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {activeProjects.map(renderProjectCard)}
          </ul>
        )}
      </section>

      {historyProjects.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Historial
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {historyProjects.map(renderProjectCard)}
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
          </Field>

          <div>
            <p className="text-sm font-medium">Etapas</p>
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
