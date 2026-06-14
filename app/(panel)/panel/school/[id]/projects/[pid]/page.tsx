"use client";

/**
 * Project edit (/panel/school/[id]/projects/[pid]).
 *
 * The board edits the project's details and stages, uploads the cover and per-stage media
 * (photos + quotes), and opens/closes the project. Text edits are saved with the button
 * (guarded against silent loss with useUnsavedChangesGuard); media uploads and status
 * changes persist immediately. `raised`/`contributorsCount` are function-maintained and
 * never written here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BackLink } from "@/components/ui/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { StageFields } from "@/components/projects/StageFields";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker, validateImageFile } from "@/components/ui/ImagePicker";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { XMarkIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
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
  PROJECT_STAGE_PHOTO_MAX,
  PROJECT_STAGE_QUOTE_MAX,
  type ProjectCurrency,
  type ProjectDoc,
  type ProjectStage,
  type SchoolDoc,
} from "@/types";

/** Lifecycle of the project + school fetch the page depends on. */
type LoadState = "loading" | "error" | "loaded";

/**
 * A stage with a stable local-only id. Keying the list on the array index reattaches a
 * StageCard's local state (busy, mediaError) to the wrong stage when one is removed, since
 * React reconciles by key; a stable id pins each card to its data. `_key` is stripped before
 * writing to Firestore — the doc only stores title/justification/cost/photos/quoteUrls.
 */
type EditableStage = ProjectStage & { _key: number };

/** Drop the local-only id so the persisted stage matches the ProjectStage shape. */
function toStored(stages: EditableStage[]): ProjectStage[] {
  return stages.map((stage) => {
    const stored = { ...stage };
    delete (stored as Partial<EditableStage>)._key;
    return stored;
  });
}

export default function ProjectEditPage() {
  const { id, pid } = useParams<{ id: string; pid: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Editable state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<ProjectCurrency>("CRC");
  const [stages, setStages] = useState<EditableStage[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Text edits (title, description, currency, cover, stage text) only persist on "Guardar
  // cambios"; the guard warns before a close/refresh would throw them away. Immediate
  // actions (media add/remove, status changes) must NOT mark dirty.
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && !saving);

  // Deterministic monotonic counter for stable stage ids (no Math.random/Date.now).
  const nextKey = useRef(0);
  const keyStages = (s: ProjectStage[]): EditableStage[] =>
    s.map((stage) => ({ ...stage, _key: nextKey.current++ }));

  // Status/delete actions hit Cloud Functions; without a busy gate a double-click fires
  // them twice. `actionBusy` covers status changes; `deleting` covers the delete — both
  // disable the whole risk zone.
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => {
    Promise.all([getProjectById(id, pid), getSchoolById(id)])
      .then(([p, s]) => {
        setProject(p);
        setSchool(s);
        setLoadState("loaded");
        if (p) {
          setTitle(p.title);
          setDescription(p.description);
          setCurrency(p.currency);
          setStages(keyStages(p.stages));
        }
      })
      .catch(() => setLoadState("error"));
    // keyStages reads only a ref counter, so it needn't be a dependency; load tracks the ids.
  }, [id, pid]);

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
          Editar proyecto
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar el proyecto. Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!project || !school)
    return <p className="text-sm text-muted">Proyecto no encontrado.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");
  if (!isManager) {
    return <p className="text-sm text-error">No administrás esta escuela.</p>;
  }

  const goal = projectGoal(stages);

  /**
   * Persist a media (photo/quote) change on a single stage WITHOUT dragging along any
   * unsaved text edits. The user may be mid-typing a title/cost when they upload a photo;
   * writing the whole editable `stages` array would silently commit that half-typed text.
   * So we start from the last persisted base (`project.stages`), apply only the media delta
   * for the target stage, and write that. We then merge the new photos/quoteUrls back into
   * the editable state (matched by `_key`) so the UI shows the new media while keeping the
   * in-progress text untouched.
   */
  const applyMedia = async (
    key: number,
    media: Pick<ProjectStage, "photos" | "quoteUrls">,
  ) => {
    const targetIndex = stages.findIndex((s) => s._key === key);
    if (targetIndex < 0) return;
    setError(null);
    // Base = what's saved in Firestore, with only this stage's media replaced.
    const base = project.stages;
    const nextPersisted = base.map((s, i) =>
      i === targetIndex ? { ...s, ...media } : s,
    );
    await updateProject(id, pid, { stages: nextPersisted });
    // Refresh the persisted base so a later media op builds on this one.
    setProject({ ...project, stages: nextPersisted });
    // Merge only the media arrays into the editable stage, preserving its live text.
    setStages((prev) =>
      prev.map((s) =>
        s._key === key
          ? { ...s, photos: media.photos, quoteUrls: media.quoteUrls }
          : s,
      ),
    );
  };

  const removeStage = async (key: number) => {
    setError(null);
    const stored = toStored(stages.filter((s) => s._key !== key));
    try {
      await updateProject(id, pid, { stages: stored });
      setProject({ ...project, stages: stored });
      setStages((prev) => prev.filter((s) => s._key !== key));
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
      const cleanStages = toStored(stages)
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
      // Refresh the persisted base and re-key the editable stages from the saved values.
      setProject({
        ...project,
        title: title.trim(),
        description: description.trim(),
        currency,
        stages: cleanStages,
        ...(coverUrl ? { coverUrl } : {}),
      });
      setStages(keyStages(cleanStages));
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const onStatus = async (status: ProjectDoc["status"]) => {
    setError(null);
    setActionBusy(true);
    try {
      await setProjectStatus(id, pid, status);
      setProject((p) => (p ? { ...p, status } : p));
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo cambiar el estado."));
    } finally {
      setActionBusy(false);
    }
  };

  const onDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteProject(id, pid);
      // Client-side navigation (no full reload) back to the project list.
      router.push(`/panel/school/${id}/projects`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar el proyecto."));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // The whole risk zone is disabled while any status/delete action is in flight.
  const riskBusy = actionBusy || deleting;

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Editar proyecto
      </h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      {/* Live progress (function-maintained raised/contributorsCount) on a soft inset panel. */}
      <div className="mt-6 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
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
          onChange={(file) => {
            setCoverFile(file);
            setDirty(true);
          }}
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
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="input"
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={3}
            maxLength={PROJECT_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDirty(true);
            }}
            className="input"
          />
        </Field>
        <Field label="Moneda">
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value as ProjectCurrency);
              setDirty(true);
            }}
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
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Etapas
          </p>
          <p className="text-xs text-muted">
            Meta total (suma de las etapas): {formatMoney(goal, currency)}.
          </p>
        </div>

        {stages.map((stage, i) => (
          <StageCard
            key={stage._key}
            stage={stage}
            index={i}
            currency={currency}
            schoolId={id}
            projectId={pid}
            canRemove={stages.length > 1}
            onText={(patch) => {
              setStages((prev) =>
                prev.map((s) =>
                  s._key === stage._key ? { ...s, ...patch } : s,
                ),
              );
              setDirty(true);
            }}
            onMedia={(media) => applyMedia(stage._key, media)}
            onRemove={() => removeStage(stage._key)}
          />
        ))}

        <button
          type="button"
          onClick={() => {
            setStages((prev) => [
              ...prev,
              { title: "", justification: "", cost: 0, _key: nextKey.current++ },
            ]);
            setDirty(true);
          }}
          className="btn btn-outline self-start"
        >
          Agregar etapa
        </button>

        <FormError message={error} />

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <SavedIndicator show={saved} onHide={() => setSaved(false)} />
        </div>
      </form>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Estado del proyecto
        </h2>
        <p className="mt-1 text-sm text-muted">
          Alcanzar la meta de dinero no cierra el proyecto: marcalo como
          completado cuando lo concretés (o cuando aceptes una donación en
          especie que lo cumpla).
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {project.status !== "completed" && (
            <button
              type="button"
              onClick={() => onStatus("completed")}
              disabled={riskBusy}
              className="btn btn-outline"
            >
              Marcar como completado
            </button>
          )}
          {project.status === "active" ? (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              disabled={riskBusy}
              className="btn btn-outline"
            >
              Cancelar proyecto
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStatus("active")}
              disabled={riskBusy}
              className="btn btn-outline"
            >
              Reabrir proyecto
            </button>
          )}
        </div>

        {/* Risk zone: delete sits in its own block so it can't be mis-tapped right next to
            the reversible status actions, especially on a wrapped mobile layout. */}
        <div className="mt-6 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Zona de riesgo
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={riskBusy}
            className="btn btn-destructive mt-2"
          >
            Eliminar proyecto
          </button>
        </div>
      </section>

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
          proyecto, así nadie puede seguir aportando. Podés reabrirlo más
          adelante.
        </p>
      </ConfirmDialog>

      {/* Destructive delete with concrete impact data (title + what was raised). */}
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar proyecto"
        tone="destructive"
        confirmLabel="Eliminar proyecto"
        cancelLabel="Cancelar"
        busy={deleting}
        busyLabel="Eliminando…"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        {project.raised > 0 ? (
          <p>
            Vas a eliminar «{project.title}». Recaudó{" "}
            {formatMoney(project.raised, project.currency)} de{" "}
            {project.contributorsCount}{" "}
            {project.contributorsCount === 1 ? "persona" : "personas"}. Los
            aportes confirmados quedan en el historial, pero el proyecto
            desaparece y no se puede deshacer.
          </p>
        ) : (
          <p>
            Vas a eliminar «{project.title}». No se puede deshacer.
          </p>
        )}
      </ConfirmDialog>

      <p className="mt-8 text-sm">
        <BackLink href={`/panel/school/${id}/projects`}>Volver a proyectos</BackLink>
      </p>
    </main>
  );
}

/** One stage: shared text fields plus immediate photo/quote uploads. */
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
  stage: EditableStage;
  index: number;
  currency: ProjectCurrency;
  schoolId: string;
  projectId: string;
  canRemove: boolean;
  onText: (patch: Partial<ProjectStage>) => void;
  onMedia: (media: Pick<ProjectStage, "photos" | "quoteUrls">) => Promise<void>;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const photos = stage.photos ?? [];
  const quotes = stage.quoteUrls ?? [];

  // Persist a media change for this stage, reporting upload/save failures inline.
  const commitMedia = async (
    media: Pick<ProjectStage, "photos" | "quoteUrls">,
  ) => {
    setMediaError(null);
    setBusy(true);
    try {
      await onMedia(media);
    } catch (err) {
      setMediaError(userErrorMessage(err, "No se pudo guardar el cambio."));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File, kind: "photo" | "quote") => {
    setMediaError(null);
    setBusy(true);
    try {
      const url = await uploadProjectAsset(schoolId, projectId, kind, file);
      if (kind === "photo") {
        await onMedia({ photos: [...photos, url], quoteUrls: quotes });
      } else {
        await onMedia({ photos, quoteUrls: [...quotes, url] });
      }
    } catch (err) {
      setMediaError(userErrorMessage(err, "No se pudo subir el archivo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Elevated calm-depth card per stage (ring + soft shadow, no hard border).
    <fieldset className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold tracking-tight text-foreground">
          Etapa {index + 1}
        </legend>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
          >
            Quitar etapa
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <StageFields
          title={stage.title}
          justification={stage.justification}
          cost={stage.cost}
          currency={currency}
          onChange={onText}
        />

        {/* Photos */}
        <div>
          <p className="text-xs font-medium">
            Fotos ({photos.length}/{PROJECT_STAGE_PHOTO_MAX})
          </p>
          {photos.length > 0 && (
            <ul className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((url, pi) => (
                <li key={url} className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface ring-1 ring-black/5">
                    <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${pi + 1}`}
                    disabled={busy}
                    onClick={() =>
                      commitMedia({
                        photos: photos.filter((p) => p !== url),
                        quoteUrls: quotes,
                      })
                    }
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < PROJECT_STAGE_PHOTO_MAX && (
            <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30">
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
                    aria-label={`Quitar cotización ${qi + 1}`}
                    disabled={busy}
                    onClick={() =>
                      commitMedia({
                        photos,
                        quoteUrls: quotes.filter((q) => q !== url),
                      })
                    }
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {quotes.length < PROJECT_STAGE_QUOTE_MAX && (
            <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30">
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
          <p role="alert" className="text-xs text-error">
            {mediaError}
          </p>
        )}
      </div>
    </fieldset>
  );
}
