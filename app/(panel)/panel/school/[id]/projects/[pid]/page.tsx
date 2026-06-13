"use client";

/**
 * Project edit (/panel/school/[id]/projects/[pid]).
 *
 * The board edits the project's details and stages, uploads the cover and per-stage media
 * (photos + quotes), and opens/closes the project. Text edits are saved with the button;
 * media uploads and status changes persist immediately (there is no enclosing save to
 * defer to, same contract as the gallery manager). `raised`/`contributorsCount` are
 * function-maintained and never written here.
 */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker, validateImageFile } from "@/components/ui/ImagePicker";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import {
  deleteProject,
  getProjectById,
  getSchoolById,
  projectGoal,
  setProjectStatus,
  updateProject,
  uploadProjectAsset,
} from "@/lib/firestore";
import {
  PROJECT_CURRENCIES,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_STAGE_JUSTIFICATION_MAX,
  PROJECT_STAGE_PHOTO_MAX,
  PROJECT_STAGE_QUOTE_MAX,
  PROJECT_STAGE_TITLE_MAX,
  PROJECT_TITLE_MAX,
  type ProjectCurrency,
  type ProjectDoc,
  type ProjectStage,
  type SchoolDoc,
} from "@/types";

export default function ProjectEditPage() {
  const { id, pid } = useParams<{ id: string; pid: string }>();
  const { user } = useAuth();

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Editable state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<ProjectCurrency>("CRC");
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return Promise.all([getProjectById(id, pid), getSchoolById(id)]).then(
      ([p, s]) => {
        setProject(p);
        setSchool(s);
        if (p) {
          setTitle(p.title);
          setDescription(p.description);
          setCurrency(p.currency);
          setStages(p.stages);
        }
      },
    );
  }, [id, pid]);

  useEffect(() => {
    load().finally(() => setLoaded(true));
  }, [load]);

  if (!loaded) return <p className="text-sm text-muted">Cargando…</p>;
  if (!project || !school)
    return <p className="text-sm text-muted">Proyecto no encontrado.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");
  if (!isManager) {
    return <p className="text-sm text-red-600">No administrás esta escuela.</p>;
  }

  const goal = projectGoal(stages);

  /** Persist the stages array immediately (used by media add/remove). */
  const persistStages = async (next: ProjectStage[]) => {
    setStages(next);
    setError(null);
    try {
      await updateProject(id, pid, { stages: next });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo guardar el cambio."));
    }
  };

  const onSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      let coverUrl = project.coverUrl;
      if (coverFile) {
        coverUrl = await uploadProjectAsset(id, pid, "cover", coverFile);
      }
      const cleanStages = stages
        .map((s) => ({
          ...s,
          title: s.title.trim(),
          justification: s.justification.trim(),
        }))
        .filter((s) => s.title);
      await updateProject(id, pid, {
        title: title.trim(),
        description: description.trim(),
        currency,
        stages: cleanStages,
        ...(coverUrl ? { coverUrl } : {}),
      });
      setCoverFile(null);
      await load();
      setSaved(true);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const onStatus = async (status: ProjectDoc["status"]) => {
    setError(null);
    try {
      await setProjectStatus(id, pid, status);
      await load();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo cambiar el estado."));
    }
  };

  const onDelete = async () => {
    if (!window.confirm("¿Eliminar este proyecto? No se puede deshacer.")) return;
    setError(null);
    try {
      await deleteProject(id, pid);
      window.location.href = `/panel/school/${id}/projects`;
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar el proyecto."));
    }
  };

  return (
    <main className="max-w-2xl">
      <h1 className="text-2xl font-bold">Editar proyecto</h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      <div className="mt-4 rounded-lg border p-3">
        <ProjectProgress
          raised={project.raised}
          goal={projectGoal(project.stages)}
          currency={project.currency}
          contributorsCount={project.contributorsCount}
          compact
        />
      </div>

      <form
        onSubmit={onSaveDetails}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
        <ImagePicker
          label="Portada del proyecto"
          hint="Imagen amplia que encabeza la tarjeta y la página del proyecto."
          value={coverFile}
          onChange={setCoverFile}
          variant="cover"
        />
        {project.coverUrl && !coverFile && (
          <p className="text-xs text-muted">
            Ya hay una portada. Subí una nueva para reemplazarla.
          </p>
        )}

        <Field label="Título">
          <input
            type="text"
            required
            maxLength={PROJECT_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={3}
            maxLength={PROJECT_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
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
          <p className="text-xs text-muted">
            Meta total (suma de las etapas): {goal} {currency}.
          </p>
        </div>

        {stages.map((stage, i) => (
          <StageCard
            key={i}
            stage={stage}
            index={i}
            currency={currency}
            schoolId={id}
            projectId={pid}
            canRemove={stages.length > 1}
            onText={(patch) =>
              setStages((prev) =>
                prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
              )
            }
            onMedia={(next) =>
              persistStages(
                stages.map((s, idx) => (idx === i ? next : s)),
              )
            }
            onRemove={() =>
              persistStages(stages.filter((_, idx) => idx !== i))
            }
          />
        ))}

        <button
          type="button"
          onClick={() =>
            setStages((prev) => [
              ...prev,
              { title: "", justification: "", cost: 0 },
            ])
          }
          className="btn btn-outline self-start"
        >
          Agregar etapa
        </button>

        <FormError message={error} />

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          {saved && (
            <span className="text-xs text-green-700">Cambios guardados.</span>
          )}
        </div>
      </form>

      <section className="mt-10 border-t pt-6">
        <h2 className="text-lg font-semibold">Estado del proyecto</h2>
        <p className="mt-1 text-sm text-muted">
          Alcanzar la meta de dinero no cierra el proyecto: marcalo como
          completado cuando lo concretés (o cuando aceptes una donación en
          especie que lo cumpla).
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {project.status !== "completed" && (
            <button
              type="button"
              onClick={() => onStatus("completed")}
              className="btn btn-outline"
            >
              Marcar como completado
            </button>
          )}
          {project.status === "active" ? (
            <button
              type="button"
              onClick={() => onStatus("cancelled")}
              className="btn btn-outline"
            >
              Cancelar proyecto
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStatus("active")}
              className="btn btn-outline"
            >
              Reabrir proyecto
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="btn btn-outline text-red-600"
          >
            Eliminar
          </button>
        </div>
      </section>

      <p className="mt-8 text-sm">
        <Link href={`/panel/school/${id}/projects`} className="underline">
          ← Volver a proyectos
        </Link>
      </p>
    </main>
  );
}

/** One stage: text fields plus immediate photo/quote uploads. */
function StageCard({
  stage,
  index,
  currency,
  schoolId,
  projectId,
  canRemove,
  onText,
  onMedia,
  onRemove,
}: {
  stage: ProjectStage;
  index: number;
  currency: ProjectCurrency;
  schoolId: string;
  projectId: string;
  canRemove: boolean;
  onText: (patch: Partial<ProjectStage>) => void;
  onMedia: (next: ProjectStage) => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const photos = stage.photos ?? [];
  const quotes = stage.quoteUrls ?? [];

  const upload = async (
    file: File,
    kind: "photo" | "quote",
  ) => {
    setMediaError(null);
    setBusy(true);
    try {
      const url = await uploadProjectAsset(schoolId, projectId, kind, file);
      if (kind === "photo") {
        onMedia({ ...stage, photos: [...photos, url] });
      } else {
        onMedia({ ...stage, quoteUrls: [...quotes, url] });
      }
    } catch (err) {
      setMediaError(userErrorMessage(err, "No se pudo subir el archivo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium">Etapa {index + 1}</legend>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted underline hover:text-red-600"
          >
            Quitar etapa
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <Field label="Título de la etapa">
          <input
            type="text"
            maxLength={PROJECT_STAGE_TITLE_MAX}
            value={stage.title}
            onChange={(e) => onText({ title: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Justificación">
          <textarea
            rows={3}
            maxLength={PROJECT_STAGE_JUSTIFICATION_MAX}
            value={stage.justification}
            onChange={(e) => onText({ justification: e.target.value })}
            className="input"
          />
        </Field>
        <Field label={`Costo (${currency})`}>
          <input
            type="number"
            min={0}
            value={stage.cost || ""}
            onChange={(e) =>
              onText({ cost: Math.max(0, Number(e.target.value) || 0) })
            }
            className="input"
          />
        </Field>

        {/* Photos */}
        <div>
          <p className="text-xs font-medium">Fotos ({photos.length}/{PROJECT_STAGE_PHOTO_MAX})</p>
          {photos.length > 0 && (
            <ul className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((url) => (
                <li key={url} className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded border border-border bg-surface">
                    <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onMedia({ ...stage, photos: photos.filter((p) => p !== url) })
                    }
                    className="text-xs text-muted underline hover:text-red-600"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < PROJECT_STAGE_PHOTO_MAX && (
            <label className="mt-1 inline-block cursor-pointer text-xs font-medium text-brand-darker underline">
              {busy ? "Subiendo…" : "Agregar foto"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const v = validateImageFile(f);
                  if (v) return setMediaError(v);
                  upload(f, "photo");
                }}
              />
            </label>
          )}
        </div>

        {/* Quotes */}
        <div>
          <p className="text-xs font-medium">
            Cotizaciones ({quotes.length}/{PROJECT_STAGE_QUOTE_MAX})
          </p>
          {quotes.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {quotes.map((url, qi) => (
                <li key={url} className="flex items-center gap-3 text-xs">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-darker underline"
                  >
                    Cotización {qi + 1}
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      onMedia({
                        ...stage,
                        quoteUrls: quotes.filter((q) => q !== url),
                      })
                    }
                    className="text-muted underline hover:text-red-600"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {quotes.length < PROJECT_STAGE_QUOTE_MAX && (
            <label className="mt-1 inline-block cursor-pointer text-xs font-medium text-brand-darker underline">
              {busy ? "Subiendo…" : "Agregar cotización (imagen o PDF)"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) upload(f, "quote");
                }}
              />
            </label>
          )}
        </div>

        {mediaError && (
          <p role="alert" className="text-xs text-red-600">
            {mediaError}
          </p>
        )}
      </div>
    </fieldset>
  );
}
