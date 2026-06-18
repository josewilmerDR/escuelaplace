"use client";

/**
 * Project edit (/panel/school/[id]/projects/[pid]).
 *
 * The board edits the project's details and stages, uploads the cover and per-stage media
 * (photos + quotes), and opens/closes the project. Text edits are saved with the button
 * (guarded against silent loss with useUnsavedChangesGuard); media uploads and status
 * changes persist immediately. `raised`/`contributorsCount` are function-maintained and
 * never written here.
 *
 * Two correctness guards worth calling out: the currency is frozen once the project has any
 * contribution (it would otherwise mix `raised` figures), and per-stage media can only be
 * uploaded onto a saved stage — a brand-new unsaved stage disables its uploads until the
 * board saves, since media is keyed to the persisted `project.stages` array. Destructive
 * actions (remove a stage, delete the project) go through a ConfirmDialog with concrete
 * impact; status/delete failures surface beside the risk zone, not in the form's error slot.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BackLink } from "@/components/ui/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { StageFields } from "@/components/projects/StageFields";
import { Card, cardClass } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker, validateImageFile } from "@/components/ui/ImagePicker";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { XMarkIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { validateProofFile } from "@/lib/files";
import { formatMoney } from "@/lib/format";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { PROFILE_COVER_ASPECT, PAGE_COVER_SIZES } from "@/lib/layout";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { safeExternalUrl } from "@/lib/url";
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
  PROJECT_STAGE_MAX,
  PROJECT_STAGE_PHOTO_MAX,
  PROJECT_STAGE_QUOTE_MAX,
  PROJECT_TITLE_MAX,
  type ProjectCurrency,
  type ProjectDoc,
  type ProjectStage,
  type SchoolDoc,
} from "@/types";

/** Lifecycle of the project + school fetch the page depends on. */
type LoadState = "loading" | "error" | "loaded";

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
}: {
  subtitle?: string;
  status?: ProjectDoc["status"];
}) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar proyecto
        </h1>
        {status && <ProjectStatusBadge status={status} />}
      </div>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
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
  // Errors from status/delete actions live next to the risk zone (#5), kept separate from
  // the form's FormError so each error sits beside the action that produced it.
  const [riskError, setRiskError] = useState<string | null>(null);
  // Accessible-only status feedback for a status change, announced via aria-live (#12).
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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

  // Status/delete actions hit Cloud Functions; without a busy gate a double-click fires
  // them twice. `actionBusy` covers status changes; `deleting` covers the delete — both
  // disable the whole risk zone.
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The stage pending removal confirmation (#2): its `_key`, or null when no dialog is open.
  const [removeKey, setRemoveKey] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

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
        <Heading />
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
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar el proyecto. Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!project || !school) {
    return (
      <main>
        <Heading />
        <p className="mt-4 text-sm text-muted">Proyecto no encontrado.</p>
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
    media: Pick<ProjectStage, "photos" | "quoteUrls">,
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
    const nextPersisted = base.map((s, i) =>
      i === targetIndex ? { ...s, ...media } : s,
    );
    await updateProject(id, pid, { stages: nextPersisted });
    // Refresh the persisted base so a later media op builds on this one. Functional updater
    // so a concurrent status change (onStatus) isn't clobbered by a stale closure value.
    setProject((prev) => (prev ? { ...prev, stages: nextPersisted } : prev));
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
      // Functional updater so a status change that landed mid-save (onStatus also uses a
      // functional updater) isn't clobbered by a stale `project` from this closure (#4a).
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
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  /** Spanish announcement for a status change, for the aria-live region (#12). */
  const statusAnnouncement = (status: ProjectDoc["status"]): string => {
    if (status === "completed") return "Proyecto marcado como completado.";
    if (status === "cancelled") return "Proyecto cancelado.";
    return "Proyecto reabierto.";
  };

  const onStatus = async (status: ProjectDoc["status"]) => {
    // Status/delete errors render in the risk zone, not the form's FormError (#5).
    setRiskError(null);
    setStatusMsg(null);
    setActionBusy(true);
    try {
      await setProjectStatus(id, pid, status);
      setProject((p) => (p ? { ...p, status } : p));
      setStatusMsg(statusAnnouncement(status));
    } catch (err) {
      setRiskError(userErrorMessage(err, "No se pudo cambiar el estado."));
    } finally {
      setActionBusy(false);
    }
  };

  const onDelete = async () => {
    setRiskError(null);
    setDeleting(true);
    try {
      await deleteProject(id, pid);
      // Client-side navigation (no full reload) back to the project list.
      router.push(`/panel/school/${id}/projects`);
    } catch (err) {
      setRiskError(userErrorMessage(err, "No se pudo eliminar el proyecto."));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // The whole risk zone is disabled while any status/delete action is in flight; also
  // freeze it while the form is saving so the two write paths don't race (#4b).
  const riskBusy = actionBusy || deleting || saving;
  // The stage targeted by the open remove dialog, for its impact summary (#2).
  const removeTarget =
    removeKey === null ? null : stages.find((s) => s._key === removeKey);

  return (
    <main>
      {/* Subtitle = school + project title for context (#21); status badge sits by the h1 (#10). */}
      <Heading
        subtitle={`${school.name} · ${project.title}`}
        status={project.status}
      />

      {/* Accessible-only status announcement for the status change; no visual banner (#12). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMsg}
      </p>

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
          // Preview the saved cover instead of just describing it, at the same aspect/sizes
          // the public project header uses, so the board sees what's live (#14).
          <div className="flex flex-col gap-1.5">
            <span
              className={`relative block w-full overflow-hidden rounded-xl bg-surface ring-1 ring-black/5 ${PROFILE_COVER_ASPECT}`}
            >
              <Image
                src={project.coverUrl}
                alt="Portada actual del proyecto"
                fill
                sizes={PAGE_COVER_SIZES}
                className="object-cover"
              />
            </span>
            <p className="text-xs text-muted">
              Esta es la portada actual. Subí una nueva para reemplazarla.
            </p>
          </div>
        )}

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

        {/* Cap stages at PROJECT_STAGE_MAX, same as the create form's StagesEditor (#8). */}
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

        <div className="flex items-center gap-3">
          {/* Disabled while saving OR while a risk-zone action runs, so the two write paths
              can't race each other (#4b). */}
          <button
            type="submit"
            disabled={saving || riskBusy}
            className="btn btn-primary"
          >
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

        {/* Status/delete errors surface here, beside the actions that raise them, instead of
            in the form's FormError far above this section (#5). */}
        {riskError && (
          <p role="alert" className="mt-3 text-sm text-error">
            {riskError}
          </p>
        )}

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
                ? "cotización"
                : "cotizaciones"}
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
  persisted,
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
  /** Whether this stage is saved in Firestore; unsaved stages can't receive media (#3). */
  persisted: boolean;
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
    // Elevated calm-depth card per stage via the shared primitive (#9). cardClass's own
    // padding is opted out (padded=false) to keep this card's tighter p-4, since a stage
    // card nests inside the form rather than standing alone like a page section.
    <fieldset className={`${cardClass("elevated", false)} p-4`}>
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
          {photos.length < PROJECT_STAGE_PHOTO_MAX &&
            (persisted ? (
              // focus-within ring makes the sr-only file input's keyboard focus visible (#13).
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
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
            ) : (
              <p className="mt-1 text-xs text-muted">
                Guardá la etapa para poder subir fotos y cotizaciones.
              </p>
            ))}
        </div>

        {/* Quotes */}
        <div>
          <p className="text-xs font-medium">
            Cotizaciones ({quotes.length}/{PROJECT_STAGE_QUOTE_MAX})
          </p>
          {quotes.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {quotes.map((url, qi) => {
                // Only render an http(s) link; a legacy/raw-written quote with a
                // javascript:/data: scheme stays inert text but is still removable (#15).
                const safeUrl = safeExternalUrl(url);
                return (
                <li key={url} className="flex items-center gap-3 text-xs">
                  {safeUrl ? (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-darker underline"
                    >
                      Cotización {qi + 1}
                    </a>
                  ) : (
                    <span className="font-medium text-muted">
                      Cotización {qi + 1} (enlace inválido)
                    </span>
                  )}
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
                );
              })}
            </ul>
          )}
          {/* When the stage isn't persisted yet, the shared hint under "Fotos" already explains
              why uploads are off, so we just omit this control rather than repeating it (#3). */}
          {quotes.length < PROJECT_STAGE_QUOTE_MAX && persisted && (
            // focus-within ring exposes the sr-only file input's keyboard focus (#13).
            <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
              {busy ? "Subiendo…" : "Agregar cotización (imagen o PDF)"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  // Validate type/size before upload, same as photos do (#19).
                  const v = validateProofFile(f);
                  if (v) return setMediaError(v);
                  upload(f, "quote");
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
