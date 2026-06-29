"use client";

/**
 * Project edit (/panel/school/[id]/projects/[pid]).
 *
 * A pure configuration form: the board edits the project's details and stages and uploads the
 * cover and per-stage media (photos + quotes). Text edits are saved with the button (guarded
 * against silent loss with useUnsavedChangesGuard); media uploads persist immediately. The
 * status actions (open/close the project) live on the manage page (./manage); deleting the
 * project is a risk-zone text action at the end of this form, mirroring how a tool's editor
 * holds its delete. `raised`/`contributorsCount` are function-maintained and never written here.
 *
 * Two correctness guards worth calling out: the currency is frozen once the project has any
 * contribution (it would otherwise mix `raised` figures), and per-stage media can only be
 * uploaded onto a saved stage — a brand-new unsaved stage disables its uploads until the
 * board saves, since media is keyed to the persisted `project.stages` array. Destructive
 * actions (remove a stage, delete the project) go through a ConfirmDialog with concrete impact.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PageTitle } from "@/components/ui/PageTitle";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { StageCard } from "@/components/projects/StageCard";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { PanelNotice } from "@/components/ui/PanelNotice";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { userErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import {
  deleteProject,
  getProjectById,
  getSchoolById,
  projectGoal,
  removeProjectCover,
  updateProject,
  uploadProjectAsset,
} from "@/lib/firestore";
import {
  PROJECT_CURRENCIES,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_STAGE_MAX,
  PROJECT_TITLE_MAX,
  type ProjectCurrency,
  type ProjectDoc,
  type ProjectStage,
  type SchoolDoc,
} from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

/**
 * The page heading, rendered identically in every state (loading, error, loaded) so the
 * title never shifts as content swaps in. The subtitle takes the school name plus the
 * project title for context (#21); during loading neither is known yet, so the subtitle
 * renders a non-breaking space to reserve the line height while the h1 stays fixed.
 * `status` mounts an optional ProjectStatusBadge next to the title once the project loads.
 */
function Heading({
  subtitle,
  status,
  backHref,
}: {
  subtitle?: string;
  status?: ProjectDoc["status"];
  /** Back link above the title — the project's management page. */
  backHref?: string;
}) {
  return (
    <PageTitle
      backHref={backHref}
      backLabel="Volver a la gestión"
      title="Editar proyecto"
      status={status ? <ProjectStatusBadge status={status} /> : undefined}
      subtitle={subtitle}
      reserveSubtitle
    />
  );
}

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
  // The project's management page: the back link target (now at the top) and where a successful
  // save returns the board.
  const manageHref = `/panel/school/${id}/projects/${pid}/manage`;

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
  // Keys of the stages currently persisted in Firestore. A media upload can only target a
  // saved stage (it writes against `project.stages`), so a brand-new unsaved stage must
  // disable its uploads until "Guardar cambios" persists it and re-keys it (#3). We track
  // identity by `_key` rather than array index because the editable array and the persisted
  // array drift as the board adds/removes stages mid-edit.
  // State (not a ref): the set drives the `persisted` prop in render, so it must be reactive —
  // reading a ref during render is fragile (a mutation wouldn't re-render). Every mutation here
  // already co-occurs with a setStages/setProject, so this adds no extra render.
  const [persistedKeys, setPersistedKeys] = useState<Set<number>>(new Set());
  const keyStages = (s: ProjectStage[]): EditableStage[] => {
    const keyed = s.map((stage) => ({ ...stage, _key: nextKey.current++ }));
    setPersistedKeys(new Set(keyed.map((stage) => stage._key)));
    return keyed;
  };

  // The stage pending removal confirmation (#2): its `_key`, or null when no dialog is open.
  const [removeKey, setRemoveKey] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  // Deleting the project is the risk-zone action at the foot of the form (like the tools
  // editor). A busy gate stops a double-fire; its error renders beside the action, not in the
  // form's FormError far above.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Removing the SAVED cover (the integrated ImagePicker's "Quitar") is confirmed, since it
  // deletes the live image immediately — unlike the rest of the form, which only persists on save.
  const [confirmRemoveCover, setConfirmRemoveCover] = useState(false);
  const [removingCover, setRemovingCover] = useState(false);

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

  if (loadState === "loading") {
    return (
      <main>
        {/* Same heading as the loaded state so the title doesn't shift; a couple of card
            placeholders fade into the form's place — no blank flash during the read. */}
        <Heading backHref={manageHref} />
        <ul className="mt-6 flex flex-col gap-4" aria-hidden="true">
          <li className="h-32 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </ul>
        <p className="sr-only" role="status">
          Cargando proyecto…
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading backHref={manageHref} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar el proyecto. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!project || !school) {
    return (
      <PanelNotice heading={<Heading backHref={manageHref} />}>
        Proyecto no encontrado.
      </PanelNotice>
    );
  }

  const isManager = isPageManager(school, user);
  if (!isManager) {
    return (
      <PanelNotice
        heading={<Heading subtitle={school.name} backHref={manageHref} />}
      >
        No administras esta escuela.
      </PanelNotice>
    );
  }

  // A project that already received contributions has its `raised` accumulated in whatever
  // currency each contribution used; the currency therefore can't change once money is in
  // (it would mix figures), and any stage is referenced by index from those contributions.
  const hasContributions =
    project.raised > 0 || project.contributorsCount > 0;

  const goal = projectGoal(stages);

  /**
   * Persist a media (photo/quote) change on a single stage WITHOUT dragging along any
   * unsaved text edits. The user may be mid-typing a title/cost when they upload a photo;
   * writing the whole editable `stages` array would silently commit that half-typed text.
   * So we start from the last persisted base (`project.stages`), apply only the media delta
   * for the target stage, and write that. We then merge the new photos/quoteUrls back into
   * the editable state (matched by `_key`) so the UI shows the new media while keeping the
   * in-progress text untouched.
   *
   * The persisted base is matched by the stage's IDENTITY within the editable list mapped
   * back onto the saved array: only stages that survive into `persistedKeys` (i.e. were
   * loaded/saved) reach here — the StageCard disables uploads for unsaved stages (#3) — so
   * the persisted-array position is the editable position filtered to persisted stages.
   */
  const applyMedia = async (
    key: number,
    media: {
      photos?: string[];
      quoteUrls?: string[];
      // `null` clears the video; `undefined` (absent) leaves it unchanged.
      videoUrl?: string | null;
    },
  ) => {
    // Only persisted stages can receive media; an unsaved stage has no slot in project.stages.
    if (!persistedKeys.has(key)) return;
    setError(null);
    // The persisted array holds exactly the persisted stages, in the same relative order as
    // they appear in the editable list. Map the target's position among persisted-only
    // editable stages onto project.stages, so a newer unsaved stage inserted earlier in the
    // editable list can't shift the index off the wrong saved stage.
    const persistedEditable = stages.filter((s) =>
      persistedKeys.has(s._key),
    );
    const targetIndex = persistedEditable.findIndex((s) => s._key === key);
    if (targetIndex < 0) return;
    const base = project.stages;
    // Apply ONLY the media keys present in `media`; videoUrl:null deletes the field so the stored
    // stage omits it (Firestore rejects an explicit `undefined`). Same merge for both the persisted
    // base and the editable copy.
    const nextPersisted = base.map((s, i) => {
      if (i !== targetIndex) return s;
      const next: ProjectStage = { ...s };
      if (media.photos !== undefined) next.photos = media.photos;
      if (media.quoteUrls !== undefined) next.quoteUrls = media.quoteUrls;
      if (media.videoUrl === null) delete next.videoUrl;
      else if (media.videoUrl !== undefined) next.videoUrl = media.videoUrl;
      return next;
    });
    await updateProject(id, pid, { stages: nextPersisted });
    // Refresh the persisted base so a later media op builds on this one. Functional updater
    // so a concurrent media op (another stage's upload/removal) isn't clobbered by a stale
    // closure value.
    setProject((prev) => (prev ? { ...prev, stages: nextPersisted } : prev));
    // Merge only the changed media into the editable stage, preserving its live text.
    setStages((prev) =>
      prev.map((s) => {
        if (s._key !== key) return s;
        const next: EditableStage = { ...s };
        if (media.photos !== undefined) next.photos = media.photos;
        if (media.quoteUrls !== undefined) next.quoteUrls = media.quoteUrls;
        if (media.videoUrl === null) delete next.videoUrl;
        else if (media.videoUrl !== undefined) next.videoUrl = media.videoUrl;
        return next;
      }),
    );
  };

  const removeStage = async (key: number) => {
    setError(null);
    const stored = toStored(stages.filter((s) => s._key !== key));
    setRemoving(true);
    try {
      await updateProject(id, pid, { stages: stored });
      // Functional updater so a concurrent status change isn't lost (see applyMedia).
      setProject((prev) => (prev ? { ...prev, stages: stored } : prev));
      setStages((prev) => prev.filter((s) => s._key !== key));
      // The removed stage left the persisted set; drop its key so its slot can't be reused.
      setPersistedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setRemoveKey(null);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo guardar el cambio."));
    } finally {
      setRemoving(false);
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
      // Currency is frozen once the project has contributions (the select is replaced by
      // static text), so persist the project's own currency in that case to avoid mixing
      // figures; otherwise persist the editable value (#1).
      const nextCurrency = hasContributions ? project.currency : currency;
      await updateProject(id, pid, {
        title: title.trim(),
        description: description.trim(),
        currency: nextCurrency,
        stages: cleanStages,
        ...(coverUrl ? { coverUrl } : {}),
      });
      setCoverFile(null);
      // Refresh the persisted base and re-key the editable stages from the saved values.
      // Functional updater so a stage media op that landed mid-save (applyMedia/removeStage
      // also use functional updaters) isn't clobbered by a stale `project` from this closure.
      setProject((prev) =>
        prev
          ? {
              ...prev,
              title: title.trim(),
              description: description.trim(),
              currency: nextCurrency,
              stages: cleanStages,
              ...(coverUrl ? { coverUrl } : {}),
            }
          : prev,
      );
      setCurrency(nextCurrency);
      setStages(keyStages(cleanStages));
      setSaved(true);
      setDirty(false);
      // Show the "Guardado" confirmation briefly, then return to the project's management page.
      // dirty is already false, so the unsaved-changes guard won't block this navigation.
      window.setTimeout(() => router.push(manageHref), 1200);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const onRemoveCover = async () => {
    setError(null);
    setRemovingCover(true);
    try {
      await removeProjectCover(id, pid);
      // Clear it from the loaded doc so the picker falls back to its "Agregar" prompt; drop any
      // staged pick too, so the board starts from a clean slate.
      setProject((prev) => (prev ? { ...prev, coverUrl: undefined } : prev));
      setCoverFile(null);
      setConfirmRemoveCover(false);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo quitar la portada."));
    } finally {
      setRemovingCover(false);
    }
  };

  const onDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteProject(id, pid);
      // Client-side navigation (no full reload) back to the project list.
      router.push(`/panel/school/${id}/projects`);
    } catch (err) {
      setDeleteError(userErrorMessage(err, "No se pudo eliminar el proyecto."));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // The stage targeted by the open remove dialog, for its impact summary (#2).
  const removeTarget =
    removeKey === null ? null : stages.find((s) => s._key === removeKey);

  return (
    <main>
      {/* Subtitle = school + project title for context (#21); status badge sits by the h1 (#10).
          The back link to the management page now lives here at the top. */}
      <Heading
        subtitle={`${school.name} · ${project.title}`}
        status={project.status}
        backHref={manageHref}
      />

      {/* Live progress (function-maintained raised/contributorsCount) on an inset card,
          same surface the public project page uses for this exact block (#9). */}
      <Card variant="inset" className="mt-6">
        <ProjectProgress
          raised={project.raised}
          goal={projectGoal(project.stages)}
          currency={project.currency}
          contributorsCount={project.contributorsCount}
          compact
        />
      </Card>

      <form
        onSubmit={onSaveDetails}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
        {/* Integrated cover (same pattern as the reinado create form): the saved cover — or a
            freshly-picked file on top — shows inside the 5:2 band with a "Cambiar imagen" + "Quitar"
            footer; when there's no cover, the band itself becomes the "Agregar" button. No more empty
            preview box beside a live image. "Quitar" on the saved cover confirms before deleting. */}
        <ImagePicker
          label="Portada del proyecto"
          hint="Imagen amplia que encabeza la tarjeta y la página del proyecto."
          value={coverFile}
          onChange={(file) => {
            setCoverFile(file);
            setDirty(true);
          }}
          variant="cover"
          currentUrl={project.coverUrl ?? null}
          onRemoveExisting={() => setConfirmRemoveCover(true)}
          removeLabel="Quitar"
        />

        <Field label="Título">
          <input
            type="text"
            required
            maxLength={PROJECT_TITLE_MAX}
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
          {hasContributions ? (
            // Currency is locked once the project received contributions: `raised` accumulates
            // in each contribution's currency, so switching it would mix figures (#1).
            <>
              <p className="input flex items-center bg-surface text-muted">
                {project.currency}
              </p>
              <p className="mt-1 text-xs text-muted">
                La moneda no se puede cambiar porque el proyecto ya recibió
                aportes.
              </p>
            </>
          ) : (
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
          )}
        </Field>

        <div>
          {/* Semantic section heading, consistent with "Estado del proyecto" below (#16). */}
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Etapas
          </h2>
          {/* "goal" is the editable working total (sum of the stages being edited); the
              progress bar above instead reflects projectGoal(project.stages) — the persisted
              reality. The two intentionally differ until "Guardar cambios" reconciles them (#20). */}
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
            // An unsaved stage has no slot in project.stages yet, so its media can't persist;
            // the card disables uploads and explains why until the stage is saved (#3).
            persisted={persistedKeys.has(stage._key)}
            onText={(patch) => {
              setStages((prev) =>
                prev.map((s) =>
                  s._key === stage._key ? { ...s, ...patch } : s,
                ),
              );
              setDirty(true);
            }}
            onMedia={(media) => applyMedia(stage._key, media)}
            // Open the confirm dialog instead of removing immediately (#2); the dialog's
            // busy gate plus `removing` prevent a double-fire (#15).
            onRemove={() => setRemoveKey(stage._key)}
          />
        ))}

        {/* Cap stages at PROJECT_STAGE_MAX, same as the create form (#8). */}
        {stages.length < PROJECT_STAGE_MAX ? (
          <button
            type="button"
            onClick={() => {
              setStages((prev) => [
                ...prev,
                {
                  title: "",
                  justification: "",
                  cost: 0,
                  _key: nextKey.current++,
                },
              ]);
              setDirty(true);
            }}
            className="btn btn-outline self-start"
          >
            Agregar etapa
          </button>
        ) : (
          <span className="text-xs text-muted">
            Máximo {PROJECT_STAGE_MAX} etapas.
          </span>
        )}

        <FormError message={error} />

        <div className="flex items-center justify-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <SavedIndicator show={saved} onHide={() => setSaved(false)} />
        </div>
      </form>

      {/* Remove a stage — confirmed, with concrete impact (its cost + how much media it holds),
          and a warning when contributions exist since they reference stages by index (#2). */}
      <ConfirmDialog
        open={removeKey !== null}
        title="Quitar etapa"
        tone="destructive"
        confirmLabel="Quitar etapa"
        cancelLabel="Cancelar"
        busy={removing}
        busyLabel="Quitando…"
        onConfirm={() => {
          if (removeKey !== null) removeStage(removeKey);
        }}
        onCancel={() => setRemoveKey(null)}
      >
        {removeTarget && (
          <>
            <p>
              Vas a quitar «
              {removeTarget.title.trim() || "Etapa sin título"}» (
              {formatMoney(removeTarget.cost, currency)}). Tiene{" "}
              {(removeTarget.photos ?? []).length}{" "}
              {(removeTarget.photos ?? []).length === 1 ? "foto" : "fotos"} y{" "}
              {(removeTarget.quoteUrls ?? []).length}{" "}
              {(removeTarget.quoteUrls ?? []).length === 1
                ? "documento"
                : "documentos"}
              .
            </p>
            {project.contributorsCount > 0 && (
              <p className="mt-2 text-warning">
                Este proyecto ya recibió aportes y algunos pueden estar ligados
                a etapas por su posición; quitar una etapa corre las demás.
              </p>
            )}
          </>
        )}
      </ConfirmDialog>

      {/* Removing the saved cover deletes the live image right away (not on "Guardar cambios"),
          so it's confirmed. */}
      <ConfirmDialog
        open={confirmRemoveCover}
        title="Quitar portada"
        tone="destructive"
        confirmLabel="Quitar portada"
        cancelLabel="Cancelar"
        busy={removingCover}
        busyLabel="Quitando…"
        onConfirm={onRemoveCover}
        onCancel={() => setConfirmRemoveCover(false)}
      >
        <p>
          Vas a quitar la portada de «{project.title}». El proyecto quedará sin
          imagen de portada hasta que subas otra. No afecta sus etapas ni sus
          aportes.
        </p>
      </ConfirmDialog>

      {/* Risk zone: deleting a project is irreversible. A centered RED text action (not a
          button — like the tools editor's "Eliminar …"), under a divider so it reads as a
          risk zone; the confirm dialog names this project and what it raised. */}
      <section className="mt-12 flex flex-col items-center gap-2 border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-sm font-medium text-error underline-offset-2 transition-colors hover:underline"
        >
          Eliminar proyecto
        </button>
        {deleteError && (
          <p role="alert" className="text-sm text-error">
            {deleteError}
          </p>
        )}
      </section>

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
          <p>Vas a eliminar «{project.title}». No se puede deshacer.</p>
        )}
      </ConfirmDialog>
    </main>
  );
}
