"use client";

/**
 * Create one school tool (/panel/school/[id]/tools/new).
 *
 * The dedicated home for the creation form. The board lands here from a kind card on the tools
 * hub, which fixes the kind via ?type=…. EVERY kind is created in one self-contained page — its
 * configuration, its per-item media (a product/service/stage photo or video, an event gallery)
 * AND its cover — and then returns to the hub, where the just-published tool now appears in the
 * school's "Principal" feed (the same flow the rifa already followed; the other kinds no longer
 * detour through the edit page). To make the media uploadable before the doc exists, the page
 * pre-allocates the tool id (newToolId) so per-item uploads land on the tool's Storage path; the
 * cover is uploaded and set right after the create write (validToolCreate excludes coverUrl from
 * the create field set, so it's a follow-up update). PURELY INFORMATIONAL — the platform never
 * processes money.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  BingoConfigFields,
  emptyBingoForm,
  toBingoInput,
  type BingoFormValue,
} from "@/components/tools/BingoConfigFields";
import {
  RaffleConfigFields,
  emptyRaffleForm,
  toRaffleInput,
  type RaffleFormValue,
} from "@/components/tools/RaffleConfigFields";
import {
  SaleProductsEditor,
  emptySaleForm,
  toSaleInput,
  type SaleFormValue,
} from "@/components/tools/SaleProductsEditor";
import {
  EventConfigFields,
  emptyEventForm,
  toEventInput,
  type EventFormValue,
} from "@/components/tools/EventConfigFields";
import {
  ServiceItemsEditor,
  emptyServiceForm,
  toServiceInput,
  type ServiceFormValue,
} from "@/components/tools/ServiceItemsEditor";
import {
  TourStagesEditor,
  emptyTourForm,
  toTourInput,
  type TourFormValue,
} from "@/components/tools/TourStagesEditor";
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { BackLink } from "@/components/ui/BackLink";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { TOOL_TYPE_LIST, toolTypeMeta } from "@/lib/tools/registry";
import {
  createTool,
  getSchoolById,
  newToolId,
  setToolCover,
  uploadToolCover,
} from "@/lib/firestore";
import {
  EVENT_PHOTO_MAX,
  TOOL_DESCRIPTION_MAX,
  TOOL_TITLE_MAX,
  type SchoolDoc,
  type ToolType,
} from "@/types";

/** Lifecycle of the school fetch the page depends on. */
type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando…";

/** Read the kind preselected by the hub card, falling back to the first kind. */
function initialType(typeParam: string | null): ToolType {
  return TOOL_TYPE_LIST.some((t) => t.key === typeParam)
    ? (typeParam as ToolType)
    : TOOL_TYPE_LIST[0].key;
}

/**
 * Page title for the kind being created — "Crear rifa", "Crear bingo"… — so the heading and
 * the submit button name the actual tool, not a generic "herramienta". Built from the registry
 * label (the single source of truth); the catch-all "Otro" kind keeps the generic wording.
 */
function createToolTitle(type: ToolType): string {
  return type === "other"
    ? "Crear herramienta"
    : `Crear ${toolTypeMeta(type).label.toLowerCase()}`;
}

/**
 * Loading shell — the static heading plus a skeleton, used by BOTH the Suspense fallback
 * (NewToolContent reads useSearchParams, which needs a boundary) and the in-component
 * `loading` state, so the two are pixel-identical and navigating here never flashes blank.
 * The fallback can't read the kind (it's behind the boundary), so it shows the generic title;
 * once inside the content the title is the kind-specific one, matching the loaded heading.
 */
function NewToolSkeleton({
  schoolId,
  title,
}: {
  schoolId: string;
  title?: string;
}) {
  return (
    <main>
      <Heading schoolId={schoolId} title={title} />
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

/** Page heading. The title names the kind being created ("Crear rifa"…); it falls back to the
 * generic wording only for the brief, kind-unaware Suspense fallback. */
function Heading({
  schoolId,
  title = "Crear una herramienta",
  subtitle,
}: {
  schoolId: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <>
      <p className="text-sm">
        <BackLink href={`/panel/school/${schoolId}/tools`}>
          Volver a herramientas
        </BackLink>
      </p>
      <header className="mt-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      </header>
    </>
  );
}

export default function NewToolPage() {
  const { id } = useParams<{ id: string }>();
  // useSearchParams (inside NewToolContent) needs a Suspense boundary to keep the route
  // statically renderable; the fallback is the same skeleton the content paints while loading.
  return (
    <Suspense fallback={<NewToolSkeleton schoolId={id} />}>
      <NewToolContent />
    </Suspense>
  );
}

function NewToolContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const typeParam = useSearchParams().get("type");

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // The kind is fixed by the hub card that opened this page (?type=…) — there's no picker to
  // switch it here, so it's read once from the URL and never changes. To create a different kind
  // the board goes back to the hub and picks another card.
  const [type] = useState<ToolType>(() => initialType(typeParam));
  // The kind-specific page title, reused by the heading (every state) and the submit button.
  const heading = createToolTitle(type);

  // The tool's id, pre-allocated once (newToolId is pure ref construction, no write) so the
  // per-item media (a product/service/stage photo or video, the event gallery) can upload to the
  // tool's Storage path while the form is still being filled. It rides along as createTool's id
  // on submit. Lazy initializer → stable across re-renders; the id is never rendered to the DOM,
  // so the SSR/CSR values differing is invisible (no hydration mismatch).
  const [toolId] = useState(() => newToolId(id));

  // Create-form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [raffleForm, setRaffleForm] = useState<RaffleFormValue>(emptyRaffleForm);
  const [tourForm, setTourForm] = useState<TourFormValue>(emptyTourForm);
  const [saleForm, setSaleForm] = useState<SaleFormValue>(emptySaleForm);
  const [serviceForm, setServiceForm] =
    useState<ServiceFormValue>(emptyServiceForm);
  const [bingoForm, setBingoForm] = useState<BingoFormValue>(emptyBingoForm);
  const [eventForm, setEventForm] = useState<EventFormValue>(emptyEventForm);
  // The event's gallery (photos + one short video). Unlike a catalog's per-item media it isn't a
  // list, so it lives here and is merged into the event config on submit. Uploaded immediately to
  // the pre-allocated tool path, like every other kind's media.
  const [eventMedia, setEventMedia] = useState<{
    photos: string[];
    videoUrl?: string;
  }>({ photos: [] });
  // Cover image, set on the creation page for EVERY kind now. Local-only until submit; uploaded
  // and set right after the tool doc is created.
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return <NewToolSkeleton schoolId={id} title={heading} />;
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading schoolId={id} title={heading} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la escuela. Revisá tu conexión e intentá de nuevo.
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
        <Heading schoolId={id} title={heading} />
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
        <Heading schoolId={id} title={heading} subtitle={school.name} />
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
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Ingresá el título de la herramienta.");
      return;
    }
    // A raffle carries its own configuration — validate and convert it before creating.
    const raffleResult = type === "raffle" ? toRaffleInput(raffleForm) : null;
    if (raffleResult && !raffleResult.ok) {
      setError(raffleResult.error);
      return;
    }
    const raffle = raffleResult?.ok ? raffleResult.input : undefined;
    // A guided tour carries its ordered stages (text + the media already uploaded per stage).
    const tourResult = type === "guided_tour" ? toTourInput(tourForm) : null;
    if (tourResult && !tourResult.ok) {
      setError(tourResult.error);
      return;
    }
    const tour = tourResult?.ok ? tourResult.input : undefined;
    // A product catalog carries its products (text + price + the media already uploaded per item).
    const saleResult = type === "sale" ? toSaleInput(saleForm) : null;
    if (saleResult && !saleResult.ok) {
      setError(saleResult.error);
      return;
    }
    const sale = saleResult?.ok ? saleResult.input : undefined;
    // A service catalog carries its services (text + optional price + the media already uploaded).
    const serviceResult = type === "service" ? toServiceInput(serviceForm) : null;
    if (serviceResult && !serviceResult.ok) {
      setError(serviceResult.error);
      return;
    }
    const service = serviceResult?.ok ? serviceResult.input : undefined;
    // A bingo carries its configuration (format + winning patterns + price); the cartones (lote)
    // are generated/imported on the edit page after creation.
    const bingoResult = type === "bingo" ? toBingoInput(bingoForm) : null;
    if (bingoResult && !bingoResult.ok) {
      setError(bingoResult.error);
      return;
    }
    const bingo = bingoResult?.ok ? bingoResult.input : undefined;
    // An event carries its date/place/map/contact plus its gallery (photos + video) — merged in
    // here, since the gallery isn't part of the EventConfigFields form.
    const eventResult = type === "event" ? toEventInput(eventForm) : null;
    if (eventResult && !eventResult.ok) {
      setError(eventResult.error);
      return;
    }
    const event = eventResult?.ok
      ? {
          ...eventResult.input,
          ...(eventMedia.photos.length > 0 ? { photos: eventMedia.photos } : {}),
          ...(eventMedia.videoUrl ? { videoUrl: eventMedia.videoUrl } : {}),
        }
      : undefined;
    setSaving(true);
    setError(null);
    try {
      // One write creates the tool with its kind config AND any per-item media already uploaded
      // to the pre-allocated path (passed as the doc id).
      await createTool(
        id,
        school.name,
        user.id,
        {
          type,
          title: trimmedTitle,
          description: description.trim(),
          ...(raffle ? { raffle } : {}),
          ...(tour ? { tour } : {}),
          ...(sale ? { sale } : {}),
          ...(service ? { service } : {}),
          ...(bingo ? { bingo } : {}),
          ...(event ? { event } : {}),
        },
        toolId,
      );
      // Every kind sets its cover here and returns to the tools hub, where the just-published
      // tool now appears. The cover is a follow-up update (validToolCreate excludes coverUrl) and
      // best-effort: the tool is already published, so a failed upload neither blocks the return
      // nor risks a duplicate on retry (the cover can still be added later from the edit page).
      if (coverFile) {
        try {
          const coverUrl = await uploadToolCover(id, toolId, coverFile);
          await setToolCover(id, toolId, coverUrl);
        } catch {
          // ignore — the tool is created; the cover can be added later from the edit page
        }
      }
      router.push(`/panel/school/${id}/tools`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear la herramienta."));
      setSaving(false);
    }
  };

  return (
    <main>
      <Heading schoolId={id} title={heading} subtitle={school.name} />

      <form
        onSubmit={onCreate}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-4"
      >
        <Field label="Título">
          <input
            type="text"
            required
            maxLength={TOOL_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder={toolTypeMeta(type).titlePlaceholder}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={3}
            maxLength={TOOL_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="Contá de qué se trata la actividad."
          />
        </Field>

        {type === "raffle" && (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <p className="mb-3 text-sm font-semibold text-foreground">
              Configuración de la rifa
            </p>
            <RaffleConfigFields value={raffleForm} onChange={setRaffleForm} />
          </div>
        )}

        {type === "guided_tour" && (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <p className="mb-3 text-sm font-semibold text-foreground">
              Etapas de la visita guiada
            </p>
            <TourStagesEditor
              value={tourForm}
              onChange={setTourForm}
              schoolId={id}
              toolId={toolId}
            />
          </div>
        )}

        {type === "sale" && (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <p className="mb-3 text-sm font-semibold text-foreground">
              Productos del catálogo
            </p>
            <SaleProductsEditor
              value={saleForm}
              onChange={setSaleForm}
              schoolId={id}
              toolId={toolId}
            />
          </div>
        )}

        {type === "service" && (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <p className="mb-3 text-sm font-semibold text-foreground">
              Servicios del catálogo
            </p>
            <ServiceItemsEditor
              value={serviceForm}
              onChange={setServiceForm}
              schoolId={id}
              toolId={toolId}
            />
          </div>
        )}

        {type === "bingo" && (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <p className="mb-3 text-sm font-semibold text-foreground">
              Configuración del bingo
            </p>
            <BingoConfigFields value={bingoForm} onChange={setBingoForm} hideFormat />
          </div>
        )}

        {type === "event" && (
          <>
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Datos del evento
              </p>
              <EventConfigFields value={eventForm} onChange={setEventForm} />
            </div>
            {/* The event's gallery (one card, not a list), mirroring the edit page. Media uploads
                immediately to the pre-allocated tool path and is merged into the event config on
                submit. */}
            <ToolItemCard
              title="Fotos y video del evento"
              removeLabel=""
              canRemove={false}
              onRemove={() => {}}
              photos={eventMedia.photos}
              videoUrl={eventMedia.videoUrl}
              photoMax={EVENT_PHOTO_MAX}
              schoolId={id}
              toolId={toolId}
              persisted
              unsavedHint=""
              onMedia={async (media) =>
                setEventMedia((prev) => ({
                  photos: media.photos ?? prev.photos,
                  videoUrl:
                    media.videoUrl !== undefined
                      ? (media.videoUrl ?? undefined)
                      : prev.videoUrl,
                }))
              }
            >
              <p className="text-xs text-muted">
                Una pequeña galería para mostrar el evento (opcional).
              </p>
            </ToolItemCard>
          </>
        )}

        {/* The cover is set here for every kind, then the board returns to the hub. */}
        <ImagePicker
          label="Portada (opcional)"
          hint="Imagen horizontal que se muestra en la tarjeta de la herramienta."
          variant="cover"
          value={coverFile}
          onChange={setCoverFile}
        />

        <FormError message={error} />

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Creando…" : heading}
        </button>
      </form>
    </main>
  );
}
