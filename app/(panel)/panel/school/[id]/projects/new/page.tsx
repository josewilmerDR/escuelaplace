"use client";

/**
 * New project (/panel/school/[id]/projects/new).
 *
 * Dedicated creation screen reached from the "+ Nuevo" button on the projects list. The board
 * defines the project's cover, title, description, currency and cost-justified stages — and each
 * stage's media (photos + a short video + supporting documents) right here, since the page
 * pre-allocates the project id so uploads land on its Storage path before the doc exists and ride
 * along on the single create write. It's a MIRROR of the edit page: the same fields, the same
 * shared <StageCard>, the same layout. Creating a project does NOT require verification — but its
 * public "Financiar" button stays off until the school is verified (see the contribution rule), so
 * the board can prepare projects ahead. On success we go to the edit page (with ?created=1).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageTitle } from "@/components/ui/PageTitle";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { StageCard, type StageMedia } from "@/components/projects/StageCard";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { PanelNotice } from "@/components/ui/PanelNotice";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { formatMoney } from "@/lib/format";
import { newLocalId } from "@/lib/local-id";
import {
  createProject,
  getSchoolById,
  newProjectId,
  projectGoal,
  updateProject,
  uploadProjectAsset,
} from "@/lib/firestore";
import {
  PROJECT_CURRENCIES,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_STAGE_MAX,
  PROJECT_TITLE_MAX,
  type ProjectCurrency,
  type ProjectStage,
  type SchoolDoc,
} from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

/** A stage being drafted: the stored shape plus a local-only id (keys React + matches async media;
 * stripped on create, since stored stages are positional). Mirrors the edit page's EditableStage. */
type StageDraft = ProjectStage & { id: string };

function emptyStage(): StageDraft {
  return { id: newLocalId("s"), title: "", justification: "", cost: 0 };
}

/**
 * The page heading, rendered identically in every state (loading, error, missing school,
 * not-a-manager, loaded) so the title never shifts as content swaps in. Its first element is a
 * back link to the school's projects list (where the "+ Nuevo" button came from). The subtitle
 * takes the school name; during loading the school isn't known yet, so the subtitle renders
 * blank (a non-breaking space keeps the line height reserved) and the h1 stays fixed.
 */
function Heading({
  schoolId,
  subtitle,
}: {
  schoolId: string;
  subtitle?: string;
}) {
  return (
    <PageTitle
      backHref={`/panel/school/${schoolId}/projects`}
      backLabel="Proyectos"
      title="Nuevo proyecto"
      subtitle={subtitle}
      reserveSubtitle
    />
  );
}

export default function NewProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // The project's id, pre-allocated once (newProjectId is pure ref construction, no write) so the
  // per-stage media (photos + a short video + documents) and the cover can upload to the project's
  // Storage path while the form is still being filled. It rides along as createProject's id on
  // submit. Lazy initializer → stable across re-renders; the id is never rendered to the DOM, so
  // SSR/CSR differing is invisible.
  const [projectId] = useState(() => newProjectId(id));

  // Create-form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<ProjectCurrency>("CRC");
  const [stages, setStages] = useState<StageDraft[]>(() => [emptyStage()]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reusable load so "Reintentar" can re-run it; a network failure lands on the error state
  // (distinct from a real missing school, which is school === null after an OK load).
  const load = useCallback(() => {
    getSchoolById(id)
      .then((s) => {
        setSchool(s);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        {/* School not loaded yet → blank subtitle, but the h1 sits in its final position. */}
        <Heading schoolId={id} />
        <ul className="mt-8 flex flex-col gap-4" aria-hidden="true">
          <li className="h-32 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </ul>
        <p className="sr-only" role="status">
          Cargando…
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading schoolId={id} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la escuela. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <PanelNotice heading={<Heading schoolId={id} />}>
        Escuela no encontrada.
      </PanelNotice>
    );
  }

  const isManager = isPageManager(school, user);

  if (!isManager) {
    return (
      <PanelNotice heading={<Heading schoolId={id} subtitle={school.name} />}>
        No administras esta escuela.
      </PanelNotice>
    );
  }

  const goal = projectGoal(stages);

  // Merge a stage's media delta into the draft (mirrors the edit page's applyMedia, but purely
  // local — the URLs ride along on the single create write). `videoUrl: null` clears the field.
  const onStageMedia = (sid: string, media: StageMedia) => {
    setStages((prev) =>
      prev.map((s) => {
        if (s.id !== sid) return s;
        const next: StageDraft = { ...s };
        if (media.photos !== undefined) next.photos = media.photos;
        if (media.quoteUrls !== undefined) next.quoteUrls = media.quoteUrls;
        if (media.videoUrl === null) delete next.videoUrl;
        else if (media.videoUrl !== undefined) next.videoUrl = media.videoUrl;
        return next;
      }),
    );
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    // Whitespace-only passes the native `required`, so check the trimmed value.
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Ingresa el título del proyecto.");
      return;
    }
    // Keep each stage's already-uploaded media (photos/video/documents) and drop the local-only id —
    // stored stages are positional. Conditional spreads so Firestore never sees `undefined`.
    const cleanStages = stages
      .map((s) => ({
        title: s.title.trim(),
        justification: s.justification.trim(),
        cost: s.cost,
        ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
        ...(s.quoteUrls && s.quoteUrls.length > 0 ? { quoteUrls: s.quoteUrls } : {}),
        ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
      }))
      .filter((s) => s.title);
    if (cleanStages.length === 0) {
      setError("Agrega al menos una etapa con título.");
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
      // Pass the pre-allocated id so the project is written at the same path its stage media
      // already uploaded to (createProject uses setDoc when given an id).
      const newId = await createProject(
        id,
        school.name,
        user.id,
        {
          title: trimmedTitle,
          description: description.trim(),
          currency,
          stages: cleanStages,
        },
        projectId,
      );
      // Upload the cover (if picked) and set it — best-effort: the project is already created, so a
      // failed upload neither blocks the redirect nor risks a duplicate, and the cover can still be
      // added from the edit page.
      if (coverFile) {
        try {
          const coverUrl = await uploadProjectAsset(id, projectId, "cover", coverFile);
          await updateProject(id, projectId, { coverUrl });
        } catch {
          // ignore — the project exists; the cover can be added from the edit page
        }
      }
      // Straight to the edit page (with ?created=1 so it can confirm the creation).
      router.push(`/panel/school/${id}/projects/${newId}?created=1`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear el proyecto."));
      setSaving(false);
    }
  };

  return (
    <main>
      <Heading schoolId={id} subtitle={school.name} />

      {school.verificationStatus !== "verified" && (
        <p className="mt-6 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          {school.verificationStatus === "needs_reverification"
            ? "Editaste datos sensibles y la escuela quedó pendiente de re-verificación: el botón “Financiar” permanece apagado hasta que el equipo apruebe los cambios."
            : "Puedes preparar proyectos desde ya, pero el botón “Financiar” recién se activa cuando el equipo verifique la escuela."}{" "}
          <Link
            href={`/panel/school/${id}/edit`}
            className="font-medium underline underline-offset-2"
          >
            Completa los datos de la escuela
          </Link>{" "}
          para empezar.
        </p>
      )}

      <form
        onSubmit={onCreate}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-4"
      >
        {/* Cover first, same integrated picker the edit page uses: an "Agregar" band when empty, a
            preview with "Cambiar imagen" / "Quitar" once a file is picked. */}
        <ImagePicker
          label="Portada del proyecto"
          hint="Imagen amplia que encabeza la tarjeta y la página del proyecto."
          value={coverFile}
          onChange={setCoverFile}
          variant="cover"
          currentUrl={null}
        />

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
            placeholder="Cuenta qué se busca lograr y por qué importa."
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
          {/* Running total = the project goal the stages are building. */}
          <p className="text-xs text-muted">
            Meta total (suma de las etapas): {formatMoney(goal, currency)}.
          </p>
        </div>

        {stages.map((stage, i) => (
          <StageCard
            key={stage.id}
            stage={stage}
            index={i}
            currency={currency}
            schoolId={id}
            projectId={projectId}
            canRemove={stages.length > 1}
            // The project id is pre-allocated, so uploads work from the first stage — no unsaved gate.
            persisted
            onText={(patch) =>
              setStages((prev) =>
                prev.map((s) => (s.id === stage.id ? { ...s, ...patch } : s)),
              )
            }
            onMedia={async (media) => onStageMedia(stage.id, media)}
            onRemove={() =>
              setStages((prev) => prev.filter((s) => s.id !== stage.id))
            }
          />
        ))}

        {/* Cap stages at PROJECT_STAGE_MAX, same as the edit form. */}
        {stages.length < PROJECT_STAGE_MAX ? (
          <button
            type="button"
            onClick={() => setStages((prev) => [...prev, emptyStage()])}
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
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Creando…" : "Crear proyecto"}
          </button>
        </div>
      </form>
    </main>
  );
}
