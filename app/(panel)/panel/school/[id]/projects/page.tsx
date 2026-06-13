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
import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function SchoolProjectsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Create-form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<ProjectCurrency>("CRC");
  const [stages, setStages] = useState<StageDraft[]>([emptyStage()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSchoolById(id), getProjectsBySchool(id)])
      .then(([s, p]) => {
        setSchool(s);
        setProjects(p);
      })
      .finally(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <p className="text-sm text-muted">Cargando…</p>;
  if (!school)
    return <p className="text-sm text-muted">Escuela no encontrada.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return <p className="text-sm text-red-600">No administrás esta escuela.</p>;
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
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
    setSaving(true);
    setError(null);
    try {
      const newId = await createProject(id, school.name, user.id, {
        title: title.trim(),
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

  return (
    <main className="max-w-2xl">
      <h1 className="text-2xl font-bold">Proyectos</h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      {school.verificationStatus !== "verified" && (
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Podés preparar proyectos desde ya, pero el botón “Financiar” recién se
          activa cuando el equipo verifique la escuela.
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Tus proyectos ({projects.length})</h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no creaste ningún proyecto.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {projects.map((p) => (
              <li key={p.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted">{p.stages.length} etapas</p>
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
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <Link
                    href={`/panel/school/${id}/projects/${p.id}`}
                    className="underline"
                  >
                    Editar
                  </Link>
                  <Link
                    href={`/school/${id}/project/${p.id}`}
                    className="underline"
                  >
                    Ver público
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Crear un proyecto</h2>
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
        <Link href="/panel" className="underline">
          ← Volver al panel
        </Link>
      </p>
    </main>
  );
}
