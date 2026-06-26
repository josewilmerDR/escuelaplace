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
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  PageantConfigFields,
  emptyPageantForm,
  toPageantInput,
  type PageantFormValue,
} from "@/components/tools/PageantConfigFields";
import {
  PageantCandidatesEditor,
  type PageantCandidatesHandle,
} from "@/components/tools/PageantCandidatesEditor";
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
import { BingoDeckPicker } from "@/components/tools/BingoDeckPicker";
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { BackLink } from "@/components/ui/BackLink";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { TOOL_TYPE_LIST, createToolTitle, toolTypeMeta } from "@/lib/tools/registry";
import {
  buildPageantFundProjectInput,
  copyDeckToTool,
  createProject,
  createTool,
  deleteBingoDeck,
  getBingoDecks,
  getSchoolById,
  newProjectId,
  newToolId,
  setToolCover,
  toolDateFromInput,
  updateProject,
  uploadToolCover,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import { safeExternalUrl } from "@/lib/url";
import {
  EVENT_PHOTO_MAX,
  TOOL_CTA_LABEL_MAX,
  TOOL_DESCRIPTION_MAX,
  TOOL_TITLE_MAX,
  type BingoDeckDoc,
  type SchoolDoc,
  type ToolStatus,
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
 * Loading shell — the static heading plus a skeleton, used by BOTH the Suspense fallback
 * (NewToolContent reads useSearchParams, which needs a boundary) and the in-component
 * `loading` state, so the two are pixel-identical and navigating here never flashes blank.
 * The fallback can't read the kind (it's behind the boundary), so it shows the generic title;
 * once inside the content the title is the kind-specific one, matching the loaded heading.
 */
function NewToolSkeleton({
  schoolId,
  title,
  backHref,
  backLabel,
}: {
  schoolId: string;
  title?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main>
      <Heading
        schoolId={schoolId}
        title={title}
        backHref={backHref}
        backLabel={backLabel}
      />
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
 * generic wording only for the brief, kind-unaware Suspense fallback. The back link returns to
 * the kind's manage page once the kind is known, falling back to the tools hub in that fallback. */
function Heading({
  schoolId,
  title = "Crear una herramienta",
  subtitle,
  backHref,
  backLabel,
}: {
  schoolId: string;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <>
      <p className="text-sm">
        <BackLink href={backHref ?? `/panel/school/${schoolId}/tools`}>
          {backLabel ?? "Volver a herramientas"}
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
  // Back link target: the kind's manage page (where this form's result lands), so "back" and the
  // post-create redirect agree. The kind-unaware Suspense fallback keeps the hub default.
  const backHref = `/panel/school/${id}/tools/manage/${type}`;
  const backLabel = `Volver a ${toolTypeMeta(type).pluralLabel}`;

  // The tool's id, pre-allocated once (newToolId is pure ref construction, no write) so the
  // per-item media (a product/service/stage photo or video, the event gallery) can upload to the
  // tool's Storage path while the form is still being filled. It rides along as createTool's id
  // on submit. Lazy initializer → stable across re-renders; the id is never rendered to the DOM,
  // so the SSR/CSR values differing is invisible (no hydration mismatch).
  const [toolId] = useState(() => newToolId(id));

  // Create-form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Visibility, like the edit page (default published). 'active' shows it on the school page; 'inactive' hides it.
  const [status, setStatus] = useState<ToolStatus>("active");
  // Activity window + call-to-action — same optional fields the edit page has (full parity).
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [raffleForm, setRaffleForm] = useState<RaffleFormValue>(emptyRaffleForm);
  const [tourForm, setTourForm] = useState<TourFormValue>(emptyTourForm);
  const [saleForm, setSaleForm] = useState<SaleFormValue>(emptySaleForm);
  const [serviceForm, setServiceForm] =
    useState<ServiceFormValue>(emptyServiceForm);
  const [bingoForm, setBingoForm] = useState<BingoFormValue>(emptyBingoForm);
  // Reusable decks (mazos) the school saved earlier, offered when creating a bingo. Picking one
  // copies its cartones into the new bingo (and pins the format to the deck's); null = create with
  // no deck (generate/import the cartones later, from the edit page). Loaded only for type 'bingo'.
  const [decks, setDecks] = useState<BingoDeckDoc[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckDeletingId, setDeckDeletingId] = useState<string | null>(null);
  const [deckPendingDelete, setDeckPendingDelete] = useState<BingoDeckDoc | null>(
    null,
  );
  const [eventForm, setEventForm] = useState<EventFormValue>(emptyEventForm);
  // Pageant ("Reinado") config (criteria, cause, window, support unit, crown weights, free-voting
  // flag) PLUS its candidate roster, collected right here so the board adds candidaturas during
  // creation instead of detouring to the edit page afterwards (less friction). The roster is a
  // subcollection, not part of PageantConfig, so it can't ride along in the createTool write — it's
  // persisted right after, against the pre-allocated tool id (like the bingo copies its mazo).
  const [pageantForm, setPageantForm] = useState<PageantFormValue>(emptyPageantForm);
  // The pageant roster editor (mounted only for type 'pageant'), driven on submit via validate()/
  // saveAll() — the SAME component the edit page uses (it self-loads, empty for a brand-new tool).
  const candidatesRef = useRef<PageantCandidatesHandle>(null);
  // Pageant padrinazgo: opt-in to receive event sponsorships at creation. Enabling it auto-creates a
  // single-stage destination project (the public "Apadrinar el reinado" CTA funds it); the board only
  // types the goal — title/cover/description are derived from the reinado on submit.
  const [sponsorEnabled, setSponsorEnabled] = useState(false);
  const [sponsorGoal, setSponsorGoal] = useState("");
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

  // Load the school's saved decks once the user is known (the read is owner-gated by rules), but
  // only for a bingo — the picker is shown nowhere else. Best-effort: a failure just yields an
  // empty list, so the board can still create the bingo and generate cartones later.
  useEffect(() => {
    if (type !== "bingo" || !user) return;
    let active = true;
    getBingoDecks(id)
      .then((d) => active && setDecks(d))
      .catch(() => active && setDecks([]))
      .finally(() => active && setDecksLoading(false));
    return () => {
      active = false;
    };
  }, [type, user, id]);

  // Selecting a deck pins the (hidden) bingo format to the deck's, so the saved config matches the
  // cartones that will be copied in; "Crear sin mazo" restores the default format.
  const onSelectDeck = (deckId: string | null) => {
    setSelectedDeckId(deckId);
    const deck = deckId ? decks.find((d) => d.id === deckId) : null;
    setBingoForm((prev) => ({
      ...prev,
      ...(deck
        ? {
            rows: String(deck.format.rows),
            cols: String(deck.format.cols),
            poolMin: String(deck.format.poolMin),
            poolMax: String(deck.format.poolMax),
          }
        : { rows: "5", cols: "5", poolMin: "0", poolMax: "75" }),
    }));
  };

  const onDeleteDeck = async (deck: BingoDeckDoc) => {
    setDeckDeletingId(deck.id);
    try {
      await deleteBingoDeck(id, deck.id);
      setDecks((prev) => prev.filter((d) => d.id !== deck.id));
      // If the deleted deck was selected, fall back to "no deck" (and its default format).
      if (selectedDeckId === deck.id) onSelectDeck(null);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar el mazo."));
    } finally {
      setDeckDeletingId(null);
      setDeckPendingDelete(null);
    }
  };

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <NewToolSkeleton
        schoolId={id}
        title={heading}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading
          schoolId={id}
          title={heading}
          backHref={backHref}
          backLabel={backLabel}
        />
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
      <main>
        <Heading
          schoolId={id}
          title={heading}
          backHref={backHref}
          backLabel={backLabel}
        />
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
        <Heading
          schoolId={id}
          title={heading}
          subtitle={school.name}
          backHref={backHref}
          backLabel={backLabel}
        />
        <p className="mt-4 text-sm text-muted">No administras esta escuela.</p>
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
      setError("Ingresa el título de la herramienta.");
      return;
    }
    // The CTA is all-or-nothing and must be a safe http(s) URL; the window's end can't precede its
    // start — the SAME checks the edit form runs (full parity).
    const label = ctaLabel.trim();
    const url = ctaUrl.trim();
    if ((label && !url) || (!label && url)) {
      setError(
        "El botón necesita tanto un texto como un enlace; completa ambos o deja los dos en blanco.",
      );
      return;
    }
    if (url && !safeExternalUrl(url)) {
      setError("El enlace del botón debe empezar con http:// o https://");
      return;
    }
    const start = toolDateFromInput(startsAt);
    const end = toolDateFromInput(endsAt);
    if (start && end && end < start) {
      setError("La fecha de fin no puede ser anterior a la de inicio.");
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
    // A "Productos" tool is a single product: its name/description are the tool's own
    // title/description (the top-level fields); the editor adds price + currency + media + contact.
    const saleResult =
      type === "sale"
        ? toSaleInput(saleForm, {
            name: trimmedTitle,
            description: description.trim(),
          })
        : null;
    if (saleResult && !saleResult.ok) {
      setError(saleResult.error);
      return;
    }
    const sale = saleResult?.ok ? saleResult.input : undefined;
    // A "Servicios" tool is a single service: its name/description are the tool's own
    // title/description (the top-level fields); the editor adds the price + currency + modality +
    // availability + media + contact.
    const serviceResult =
      type === "service"
        ? toServiceInput(serviceForm, {
            name: trimmedTitle,
            description: description.trim(),
          })
        : null;
    if (serviceResult && !serviceResult.ok) {
      setError(serviceResult.error);
      return;
    }
    const service = serviceResult?.ok ? serviceResult.input : undefined;
    // A bingo carries its configuration (format + winning patterns + price); the cartones (lote)
    // come from the chosen mazo (deck), copied into the bingo right after creation.
    const bingoResult = type === "bingo" ? toBingoInput(bingoForm) : null;
    if (bingoResult && !bingoResult.ok) {
      setError(bingoResult.error);
      return;
    }
    const bingo = bingoResult?.ok ? bingoResult.input : undefined;
    // A bingo's cartones come from a mazo (deck), chosen here — it's required, since cartones can't
    // be added after creation (they live in the mazo).
    if (type === "bingo" && !selectedDeckId) {
      setError(
        decks.length === 0
          ? "Necesitas un mazo para crear el bingo. Crea uno primero con «Crear o administrar mazos»."
          : "Elige un mazo de cartones para el bingo.",
      );
      return;
    }
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
    // A reinado carries its config (criteria/cause/window/support unit/crown weights/free-voting)
    // plus its candidate roster (collected here, persisted after the tool exists — see below).
    const pageantResult = type === "pageant" ? toPageantInput(pageantForm) : null;
    if (pageantResult && !pageantResult.ok) {
      setError(pageantResult.error);
      return;
    }
    const pageant = pageantResult?.ok ? pageantResult.input : undefined;
    // Validate the roster before creating the tool (drops blank rows, requires a name on the rest) —
    // via the SAME imperative handle the edit page uses.
    if (type === "pageant") {
      const candidatesError = candidatesRef.current?.validate();
      if (candidatesError) {
        setError(candidatesError);
        return;
      }
    }
    // Padrinazgo: enabling it auto-creates the destination project, so the goal (its only stage cost)
    // is required.
    let sponsorGoalNum = 0;
    if (type === "pageant" && sponsorEnabled) {
      sponsorGoalNum = Math.round(Number(sponsorGoal));
      if (!Number.isFinite(sponsorGoalNum) || sponsorGoalNum < 1) {
        setError("Ingresa una meta de recaudación para el padrinazgo (mayor a 0).");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      // Padrinazgo: create the destination project FIRST (so the reinado never points at a missing
      // project) and thread its id into the pageant config below. The cover is inherited after the
      // cover upload, like the tool's own (the create rule omits coverUrl). A later failure leaves at
      // most a benign orphan project.
      let fundProjectId: string | undefined;
      if (type === "pageant" && pageant && sponsorEnabled) {
        const projectId = newProjectId(id);
        await createProject(
          id,
          school.name,
          user.id,
          buildPageantFundProjectInput({
            toolTitle: trimmedTitle,
            cause: pageant.cause,
            currency: pageant.currency,
            goal: sponsorGoalNum,
          }),
          projectId,
        );
        fundProjectId = projectId;
      }
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
          status,
          startsAt: start,
          endsAt: end,
          cta: label && url ? { label, url } : null,
          ...(raffle ? { raffle } : {}),
          ...(tour ? { tour } : {}),
          ...(sale ? { sale } : {}),
          ...(service ? { service } : {}),
          ...(bingo ? { bingo } : {}),
          ...(event ? { event } : {}),
          ...(pageant
            ? {
                pageant: {
                  ...pageant,
                  ...(fundProjectId ? { fundProjectId } : {}),
                },
              }
            : {}),
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
          // Inherit the reinado's cover into its padrinazgo project (best-effort).
          if (fundProjectId) {
            await updateProject(id, fundProjectId, { coverUrl }).catch(() => {});
          }
        } catch {
          // ignore — the tool is created; the cover can be added later from the edit page
        }
      }
      // When a bingo is created from a deck, copy the deck's cartones into the new bingo's lote and
      // land on the edit page so the board sees the populated lote. Best-effort, like the cover: the
      // bingo already exists, so a failed copy must neither block the flow nor risk a duplicate lote
      // on a form retry — the board can generate/import from the edit page. Every other kind falls
      // through to the kind's manage page, where the just-created tool now appears in the list.
      if (type === "bingo" && selectedDeckId) {
        try {
          await copyDeckToTool(id, selectedDeckId, toolId);
        } catch {
          // ignore — the bingo is created; the cartones can be generated from the edit page
        }
        router.push(`/panel/school/${id}/tools/${toolId}`);
        return;
      }
      // A reinado lands on its OWN management panel after creation (the per-reinado control cockpit —
      // the same surface the board reaches by clicking the reinado card — where the votes, the gala and
      // the coronación live) rather than the edit page or the generic manage hub, so the board continues
      // running it right there. Its roster, if any, persists first — a subcollection, so it can't ride
      // along in the createTool write. Best-effort, like the bingo copy: the reinado already exists, so
      // a mid-roster failure must neither block the flow nor risk duplicates on a form retry — the
      // board finishes the roster from the reinado's edit page.
      if (type === "pageant") {
        // Persist the roster the SAME way the edit page does (saveAll on the shared editor). Best-effort:
        // the reinado already exists, so a mid-roster failure must neither block the flow nor risk
        // duplicates on a form retry — the board finishes the roster from the reinado's edit page.
        try {
          await candidatesRef.current?.saveAll();
        } catch {
          // ignore — the reinado is created; the roster can be finished from the edit page
        }
        router.push(`/panel/school/${id}/tools/${toolId}/manage`);
        return;
      }
      // Land on the kind's manage page, where the just-created tool now appears in the list.
      router.push(`/panel/school/${id}/tools/manage/${type}`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear la herramienta."));
      setSaving(false);
    }
  };

  return (
    <main>
      <Heading
        schoolId={id}
        title={heading}
        subtitle={school.name}
        backHref={backHref}
        backLabel={backLabel}
      />

      <form
        onSubmit={onCreate}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-4"
      >
        <Field label={toolTypeMeta(type).titleLabel}>
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
            placeholder="Cuenta de qué se trata la actividad."
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
              Detalles del producto
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
              Detalles del servicio
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
          <>
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-1 text-sm font-semibold text-foreground">
                Mazo de cartones <span className="text-error">*</span>
              </p>
              <p className="mb-3 text-xs text-muted">
                Elige el mazo (lote de cartones) para este bingo. Sus cartones se copian al
                bingo al crearlo. Es obligatorio: los cartones viven en el mazo y no se
                editan dentro del bingo.
              </p>
              {decksLoading ? (
                <p className="text-sm text-muted">Cargando mazos…</p>
              ) : decks.length === 0 ? (
                <p className="rounded-xl bg-brand-tint p-3 text-sm text-brand-darker ring-1 ring-brand-darker/10">
                  Necesitas un mazo para crear un bingo y todavía no tienes ninguno. Crea uno
                  primero (con sus cartones) y vuelve a crear el bingo.
                </p>
              ) : (
                <BingoDeckPicker
                  decks={decks}
                  selectedDeckId={selectedDeckId}
                  onSelect={onSelectDeck}
                  onDelete={(deck) => setDeckPendingDelete(deck)}
                  deletingId={deckDeletingId}
                  disabled={saving}
                />
              )}
              {/* Open the deck library in a new tab so the in-progress bingo form isn't lost. */}
              <p className="mt-3 text-xs">
                <a
                  href={`/panel/school/${id}/bingo-decks`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-darker hover:underline"
                >
                  Crear o administrar mazos ↗
                </a>
              </p>
            </div>
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Configuración del bingo
              </p>
              <BingoConfigFields value={bingoForm} onChange={setBingoForm} hideFormat />
            </div>
          </>
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

        {type === "pageant" && (
          <>
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Configuración del reinado
              </p>
              <PageantConfigFields value={pageantForm} onChange={setPageantForm} />
            </div>
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-1 text-sm font-semibold text-foreground">
                Candidaturas (opcional)
              </p>
              <p className="mb-3 text-xs text-muted">
                Agrega aquí las candidatas o candidatos. Siempre puedes editar esto después.
              </p>
              <PageantCandidatesEditor
                ref={candidatesRef}
                schoolId={id}
                toolId={toolId}
                showJuryScore={false}
              />
            </div>

            {/* Padrinazgo (opcional): opting in auto-creates a single-stage destination project the
                public "Apadrinar el reinado" CTA funds; the board only types the goal. */}
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-1 text-sm font-semibold text-foreground">
                Padrinazgo del reinado (opcional)
              </p>
              <p className="mb-3 text-xs text-muted">
                Habilita un botón «Apadrinar el reinado» en la página pública para recibir aportes
                hacia los costos del evento (logística, decoración, etc.) — sin apuntar a ninguna
                candidatura.
              </p>

              <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-black/5">
                <input
                  type="checkbox"
                  checked={sponsorEnabled}
                  onChange={(e) => setSponsorEnabled(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span className="text-sm">
                  <span className="font-medium text-foreground">
                    Recibir padrinazgos para el reinado
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Al crear se generará un proyecto asociado para recibir los aportes.
                  </span>
                </span>
              </label>

              {sponsorEnabled && (
                <div className="mt-4 flex flex-col gap-4">
                  <Field label="Meta de recaudación">
                    <input
                      type="number"
                      min={1}
                      step="any"
                      inputMode="decimal"
                      value={sponsorGoal}
                      onChange={(e) => setSponsorGoal(e.target.value)}
                      className="input"
                      placeholder="Ej.: 150000"
                    />
                    <span className="text-muted">
                      Se creará el proyecto «{title.trim() || "Reinado"} — costos del evento»
                      {Number(sponsorGoal) > 0
                        ? `, meta ${formatMoney(Math.round(Number(sponsorGoal)), pageantForm.currency)}`
                        : ""}
                      .
                    </span>
                  </Field>

                  <div className="rounded-xl bg-white p-3 text-xs text-muted ring-1 ring-black/5">
                    <p className="font-medium text-foreground">Al activar:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      <li>
                        Será público y aparecerá en los proyectos de tu escuela, con barra de
                        recaudación.
                      </li>
                      <li>
                        Los padrinos pagan directo a la escuela; vos confirmás cada aporte en tu
                        panel de proyectos.
                      </li>
                      <li>
                        Es editable después (meta, descripción, etapas) y lo cerrás cuando termine el
                        evento.
                      </li>
                      <li>
                        La plataforma nunca toca el dinero; la escuela se compromete a usarlo para el
                        reinado.
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Desde (opcional)">
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Hasta (opcional)">
            <input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Texto del botón (opcional)">
            <input
              type="text"
              maxLength={TOOL_CTA_LABEL_MAX}
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              className="input"
              placeholder="Ej.: Escríbenos por WhatsApp"
            />
          </Field>
          <Field label="Enlace del botón (opcional)">
            <input
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              className="input"
              placeholder="https://…"
            />
          </Field>
        </div>

        <Field label="Visibilidad">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ToolStatus)}
            className="input"
          >
            <option value="active">Visible en la página de la escuela</option>
            <option value="inactive">Oculta</option>
          </select>
        </Field>

        <FormError message={error} />

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Creando…" : heading}
        </button>
      </form>

      <ConfirmDialog
        open={deckPendingDelete !== null}
        title="Eliminar mazo"
        tone="destructive"
        confirmLabel="Eliminar"
        busy={deckDeletingId !== null}
        busyLabel="Eliminando…"
        onConfirm={() => deckPendingDelete && onDeleteDeck(deckPendingDelete)}
        onCancel={() => setDeckPendingDelete(null)}
      >
        <p className="text-sm text-muted">
          Se elimina el mazo «{deckPendingDelete?.name}» y sus{" "}
          {deckPendingDelete?.cardCount} cartones guardados. Los bingos que ya lo usaron
          conservan sus cartones. No se puede deshacer.
        </p>
      </ConfirmDialog>
    </main>
  );
}
