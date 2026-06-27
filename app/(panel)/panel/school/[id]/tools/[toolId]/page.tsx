"use client";

/**
 * Edit one school tool (/panel/school/[id]/tools/[toolId]).
 *
 * The board edits the tool's type, title, description, cover, optional activity window, an
 * optional call-to-action link, and its visibility (active/hidden). The cover uploads on save
 * (Storage), like the projects edit page. PURELY INFORMATIONAL — the CTA is a link the school
 * controls (scheme-checked on write); the platform never processes money.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  BingoConfigFields,
  bingoFormFromConfig,
  emptyBingoForm,
  toBingoInput,
  type BingoFormValue,
} from "@/components/tools/BingoConfigFields";
import {
  EventConfigFields,
  emptyEventForm,
  eventFormFromConfig,
  toEventInput,
  type EventFormValue,
} from "@/components/tools/EventConfigFields";
import {
  PageantConfigFields,
  emptyPageantForm,
  pageantFormFromConfig,
  toPageantInput,
  type PageantFormValue,
} from "@/components/tools/PageantConfigFields";
import {
  PageantCandidatesEditor,
  type PageantCandidatesHandle,
} from "@/components/tools/PageantCandidatesEditor";
import {
  RaffleConfigFields,
  emptyRaffleForm,
  raffleFormFromConfig,
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
  ServiceItemsEditor,
  emptyServiceForm,
  toServiceInput,
  type ServiceFormValue,
} from "@/components/tools/ServiceItemsEditor";
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { deleteToolTitle, editToolTitle, toolTypeMeta } from "@/lib/tools/registry";
import { BackLink } from "@/components/ui/BackLink";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { userErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { CARD_COVER_ASPECT, CARD_COVER_SIZES } from "@/lib/layout";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { safeExternalUrl } from "@/lib/url";
import {
  buildPageantFundProjectInput,
  clearToolCover,
  createProject,
  deleteTool,
  getSchoolById,
  getToolById,
  newProjectId,
  toolConfigOf,
  toolContactPhone,
  updateProject,
  updateTool,
  updateToolEvent,
  updateToolTour,
  uploadToolCover,
  type EventConfigInput,
  type TourConfigInput,
} from "@/lib/firestore";
import {
  BINGO_PATTERNS,
  EVENT_PHOTO_MAX,
  RAFFLE_NUMBER_COUNT,
  TOOL_CONTACT_LABEL_MAX,
  TOOL_DESCRIPTION_MAX,
  TOOL_TITLE_MAX,
  TOUR_STAGE_DESCRIPTION_MAX,
  TOUR_STAGE_MAX,
  TOUR_STAGE_PHOTO_MAX,
  TOUR_STAGE_TITLE_MAX,
  type BingoConfig,
  type EventConfig,
  type RaffleConfig,
  type SaleConfig,
  type SchoolDoc,
  type ServiceConfig,
  type ToolConfig,
  type ToolDoc,
  type ToolStatus,
  type ToolType,
  type TourConfig,
  type TourStage,
} from "@/types";

type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando herramienta…";

/** Page heading with a back link. The link returns to the kind's manage page once the kind is
 * known (the loaded state), falling back to the tools hub in the brief load/error states where the
 * kind isn't read yet. Mirrors the creation page's heading. */
function Heading({
  schoolId,
  title = "Editar herramienta",
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

/**
 * A guided-tour stage with a stable local-only id, so React keys the cards on identity rather
 * than array index (else removing one stage would reattach a card's local state to the wrong
 * stage). `_key` is stripped before writing — the doc only stores title/description/photos/
 * videoUrl. Mirrors the project editor's EditableStage.
 */
type EditableTourStage = TourStage & { _key: number };

export default function EditToolPage() {
  const { id, toolId } = useParams<{ id: string; toolId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tool, setTool] = useState<ToolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Editable fields
  const [type, setType] = useState<ToolType>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ToolStatus>("active");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  // Tool-level WhatsApp contact for the "Consultar" button: an alternate number (empty = school
  // board phone) and a custom button label (empty = "Consultar").
  const [contactPhone, setContactPhone] = useState("");
  const [contactLabel, setContactLabel] = useState("");
  const [raffleForm, setRaffleForm] = useState<RaffleFormValue>(emptyRaffleForm);
  // Bingo config form (prizes, price, modality…). The cartones (lote) are NOT managed here — they
  // live in a reusable mazo (deck) bound to the bingo at creation; the edit page only links out to
  // the mazos library. So there's no editable card list and no card-count tracking here.
  const [bingoForm, setBingoForm] = useState<BingoFormValue>(emptyBingoForm);

  // Event ("Eventos") editable state. Date/place/map/contact save with the form button; the
  // gallery (photos/video) persists immediately against the saved event config, like the catalog kinds.
  const [eventForm, setEventForm] = useState<EventFormValue>(emptyEventForm);

  // Pageant ("Reinado") editable config (criteria/cause/window/support unit/crown weights/free-
  // voting flag). The candidate roster is a subcollection managed separately, not through this form.
  const [pageantForm, setPageantForm] = useState<PageantFormValue>(emptyPageantForm);

  // Pageant padrinazgo: opt-in to receive event sponsorships, which auto-creates a single-stage
  // destination project the public "Apadrinar el reinado" CTA funds. `sponsorGoal` is the ONLY field
  // the board fills — title/cover/description are derived from the reinado. `existingFundProjectId` is
  // set on load when the reinado is already linked: then the section shows the link (read-only) and we
  // PRESERVE it across edits (toPageantInput drops it, so updateTool would otherwise wipe it).
  const [sponsorEnabled, setSponsorEnabled] = useState(false);
  const [sponsorGoal, setSponsorGoal] = useState("");
  const [existingFundProjectId, setExistingFundProjectId] = useState<
    string | undefined
  >(undefined);

  // Guided-tour editable state. Stage text saves with the form button; stage media (photos/video)
  // persists immediately, the way the project editor handles stage media. The WhatsApp contact is
  // tool-level now (contactPhone above), not per-tour.
  const [tourStages, setTourStages] = useState<EditableTourStage[]>([]);
  // Deterministic monotonic counter for stable stage ids (no Math.random/Date.now).
  const nextTourKey = useRef(0);
  // Keys of stages currently persisted in Firestore — a media upload can only target a saved
  // stage (it writes against the saved tour config's stages), so a brand-new unsaved stage disables uploads
  // until "Guardar cambios" persists and re-keys it (mirrors the project editor).
  const [tourPersistedKeys, setTourPersistedKeys] = useState<Set<number>>(
    new Set(),
  );
  // The stage pending removal confirmation (its _key), or null when no dialog is open.
  const [tourRemoveKey, setTourRemoveKey] = useState<number | null>(null);
  const [tourRemoving, setTourRemoving] = useState(false);

  // Sale ("Productos") editable state. A "Productos" tool is a SINGLE product, so editing mirrors
  // creation exactly: the tool's title/description ARE the product's name/description (the top-level
  // fields), and this form holds only the price/currency/contact/media — the same SaleFormValue the
  // create page uses, edited through the shared SaleProductsEditor. Everything saves with the form
  // button (the media files already uploaded to Storage; the form persists their URLs).
  const [saleForm, setSaleForm] = useState<SaleFormValue>(emptySaleForm);

  // Service ("Servicios") editable state. A "Servicios" tool is a SINGLE service, so editing mirrors
  // creation exactly: the tool's title/description ARE the service's name/description (the top-level
  // fields), and this form holds only the price/currency/modality/availability/contact/media — the
  // same ServiceFormValue the create page uses, edited through the shared ServiceItemsEditor.
  // Everything saves with the form button (the media files already uploaded to Storage; the form
  // persists their URLs).
  const [serviceForm, setServiceForm] =
    useState<ServiceFormValue>(emptyServiceForm);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Removing the SAVED cover (immediate, confirmed) — separate from picking a replacement (coverFile).
  const [confirmRemoveCover, setConfirmRemoveCover] = useState(false);
  const [removingCover, setRemovingCover] = useState(false);
  // The pageant roster editor (mounted only for type 'pageant'). The form's "Guardar cambios" drives
  // its validate()/saveAll() so the candidate subcollection persists with the tool — not per row.
  const candidatesRef = useRef<PageantCandidatesHandle>(null);

  useUnsavedChangesGuard(dirty);

  // Attach a stable local id to each persisted stage and record the persisted set, so media can
  // only target a saved stage (see tourPersistedKeys). Reads only a ref counter, so it needn't
  // be a dependency of load below; load itself tracks the ids.
  const keyTourStages = (stages: TourStage[]): EditableTourStage[] => {
    const keyed = stages.map((s) => ({ ...s, _key: nextTourKey.current++ }));
    setTourPersistedKeys(new Set(keyed.map((s) => s._key)));
    return keyed;
  };

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getToolById(id, toolId)])
      .then(([s, t]) => {
        setSchool(s);
        setTool(t);
        if (t) {
          setType(t.type);
          setTitle(t.title);
          setDescription(t.description);
          setStatus(t.status);
          // Seed the tool-level WhatsApp contact, migrating a legacy per-kind config.contactPhone up
          // (toolContactPhone reads it as a fallback) — on save it's written at the tool level and
          // dropped from config.
          setContactPhone(toolContactPhone(t));
          setContactLabel(t.contactLabel ?? "");
          const raffleCfg = toolConfigOf(t, "raffle");
          if (raffleCfg) setRaffleForm(raffleFormFromConfig(raffleCfg));
          const bingoCfg = toolConfigOf(t, "bingo");
          if (bingoCfg) setBingoForm(bingoFormFromConfig(bingoCfg));
          const eventCfg = toolConfigOf(t, "event");
          if (eventCfg) setEventForm(eventFormFromConfig(eventCfg));
          const pageantCfg = toolConfigOf(t, "pageant");
          if (pageantCfg) {
            setPageantForm(pageantFormFromConfig(pageantCfg));
            // Reflect an existing padrinazgo link: keep the toggle on and remember the project so the
            // section renders it read-only and the save preserves it.
            setExistingFundProjectId(pageantCfg.fundProjectId);
            setSponsorEnabled(Boolean(pageantCfg.fundProjectId));
          }
          const tourCfg = toolConfigOf(t, "guided_tour");
          if (tourCfg) {
            setTourStages(keyTourStages(tourCfg.stages));
          }
          const saleCfg = toolConfigOf(t, "sale");
          if (saleCfg && saleCfg.products.length > 0) {
            // A "Productos" tool is a single product: its name/description are the tool's
            // title/description (set above), so the form holds only price/currency/contact/media.
            const p = saleCfg.products[0];
            setSaleForm({
              id: p.id,
              price: String(p.price),
              currency: saleCfg.currency,
              contactPhone: "",
              ...(p.photos && p.photos.length > 0 ? { photos: p.photos } : {}),
              ...(p.videoUrl ? { videoUrl: p.videoUrl } : {}),
            });
          }
          const serviceCfg = toolConfigOf(t, "service");
          if (serviceCfg && serviceCfg.services.length > 0) {
            // A "Servicios" tool is a single service: its name/description are the tool's
            // title/description (set above), so the form holds only the
            // price/currency/modality/availability/contact/media.
            const s = serviceCfg.services[0];
            setServiceForm({
              id: s.id,
              price: typeof s.price === "number" ? String(s.price) : "",
              priceFrom: Boolean(s.priceFrom),
              modalities: s.modalities ?? [],
              availability: s.availability ?? "",
              currency: serviceCfg.currency,
              contactPhone: "",
              ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
              ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
            });
          }
        }
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
    // keyTourStages reads only a ref counter, so it needn't be a dependency; load tracks the ids.
  }, [id, toolId]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading schoolId={id} />
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

  if (loadState === "error") {
    return (
      <main>
        <Heading schoolId={id} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la herramienta. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school || !tool) {
    return (
      <main>
        <Heading schoolId={id} />
        <p className="mt-4 text-sm text-muted">
          {!school ? "Escuela no encontrada." : "Herramienta no encontrada."}
        </p>
        <p className="mt-6 text-sm">
          <BackLink href={`/panel/school/${id}/tools`}>
            Volver a herramientas
          </BackLink>
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
        <Heading schoolId={id} subtitle={school.name} />
        <p className="mt-4 text-sm text-muted">No administras esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Ingresa el título de la herramienta.");
      return;
    }
    // A raffle carries its own config — validate it (only when the tool is a raffle).
    const raffleResult = type === "raffle" ? toRaffleInput(raffleForm) : null;
    if (raffleResult && !raffleResult.ok) {
      setError(raffleResult.error);
      return;
    }
    const raffle = raffleResult?.ok ? raffleResult.input : undefined;

    // A guided tour carries its ordered stages (text + already-uploaded media). Build it from the
    // editable stages; require at least one named stage. Empty stages (no title, description or
    // media — e.g. an "Agregar etapa" never filled) are dropped.
    let tour: TourConfigInput | undefined;
    if (type === "guided_tour") {
      const cleanStages = tourStages
        .map((s) => ({
          title: s.title.trim(),
          description: s.description.trim(),
          ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
          ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
        }))
        .filter(
          (s) =>
            s.title ||
            s.description ||
            (s.photos?.length ?? 0) > 0 ||
            Boolean(s.videoUrl),
        );
      if (cleanStages.length === 0) {
        setError("Agrega al menos una etapa con su nombre.");
        return;
      }
      if (cleanStages.some((s) => !s.title)) {
        setError("Cada etapa necesita un nombre.");
        return;
      }
      tour = { stages: cleanStages };
    }

    // A "Productos" tool is a single product: its name/description are the tool's own
    // title/description (the top-level fields); the form folds in the price/currency/media/contact.
    // Validated and converted exactly like the creation page (shared toSaleInput).
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
    // title/description (the top-level fields); the form folds in the
    // price/currency/modality/availability/media/contact. Validated and converted exactly like the
    // creation page (shared toServiceInput). Price is optional (blank = quote-based).
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

    // A bingo carries its configuration (format + winning patterns + price). The cartones (lote)
    // live in a reusable mazo (deck), bound to the bingo at creation — never edited here.
    const bingoResult = type === "bingo" ? toBingoInput(bingoForm) : null;
    if (bingoResult && !bingoResult.ok) {
      setError(bingoResult.error);
      return;
    }
    const bingo = bingoResult?.ok ? bingoResult.input : undefined;

    // An event carries its date/place/map/contact; the gallery (already-uploaded media) is
    // preserved from the persisted base, since it persists immediately, not through this form.
    let event: EventConfigInput | undefined;
    if (type === "event") {
      const eventResult = toEventInput(eventForm);
      if (!eventResult.ok) {
        setError(eventResult.error);
        return;
      }
      const eventBase = toolConfigOf(tool, "event");
      event = {
        ...eventResult.input,
        ...(eventBase?.photos && eventBase.photos.length > 0
          ? { photos: eventBase.photos }
          : {}),
        ...(eventBase?.videoUrl ? { videoUrl: eventBase.videoUrl } : {}),
      };
    }

    // A reinado carries its config (criteria/cause/window/support unit/crown weights/free-voting)
    // plus its candidate roster (a subcollection edited below; it persists with this save, not per row).
    const pageantResult = type === "pageant" ? toPageantInput(pageantForm) : null;
    if (pageantResult && !pageantResult.ok) {
      setError(pageantResult.error);
      return;
    }
    const pageant = pageantResult?.ok ? pageantResult.input : undefined;
    // Validate the roster before any write, so an invalid candidate never leaves a half-saved tool.
    if (type === "pageant") {
      const candidatesError = candidatesRef.current?.validate();
      if (candidatesError) {
        setError(candidatesError);
        return;
      }
    }

    // Padrinazgo: enabling it on a not-yet-linked reinado auto-creates the destination project, so the
    // goal (its only stage cost) is required. An already-linked reinado keeps its project untouched.
    let sponsorGoalNum = 0;
    const willCreateFundProject =
      type === "pageant" && sponsorEnabled && !existingFundProjectId;
    if (willCreateFundProject) {
      if (!user) {
        setError("Inicia sesión para crear el proyecto del padrinazgo.");
        return;
      }
      sponsorGoalNum = Math.round(Number(sponsorGoal));
      if (!Number.isFinite(sponsorGoalNum) || sponsorGoalNum < 1) {
        setError("Ingresa una meta de recaudación para el padrinazgo (mayor a 0).");
        return;
      }
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      let coverUrl: string | undefined;
      if (coverFile) {
        coverUrl = await uploadToolCover(id, toolId, coverFile);
      }

      // Padrinazgo: create the destination project FIRST so the reinado never points at a missing
      // project (an orphan project on a later failure is benign). It inherits the reinado's cover via a
      // follow-up updateProject (the create rule omits coverUrl). An existing link is preserved as-is.
      // The resulting id rides into the pageant config — toPageantInput never carries it, so without
      // this an edit would wipe an existing fundProjectId.
      let fundProjectId = existingFundProjectId;
      if (pageant && willCreateFundProject && user) {
        const projectId = newProjectId(id);
        await createProject(
          id,
          tool?.schoolName ?? school?.name ?? "",
          user.id,
          buildPageantFundProjectInput({
            toolTitle: trimmedTitle,
            cause: pageant.cause,
            currency: pageant.currency,
            goal: sponsorGoalNum,
          }),
          projectId,
        );
        const eventCover = coverUrl ?? tool?.coverUrl;
        if (eventCover) {
          await updateProject(id, projectId, { coverUrl: eventCover }).catch(
            () => {},
          );
        }
        fundProjectId = projectId;
      }

      await updateTool(id, toolId, {
        type,
        title: trimmedTitle,
        description: description.trim(),
        status,
        ...(coverUrl ? { coverUrl } : {}),
        contactPhone,
        contactLabel,
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
      });
      // Persist the candidate roster in the same save (creates/updates/deletes staged in the editor).
      // Throws on failure → the catch below surfaces it; already-validated above.
      if (type === "pageant") {
        await candidatesRef.current?.saveAll();
        // A reinado returns to its management panel (the live control cockpit — votes, gala,
        // coronación) after saving, mirroring the create flow, instead of staying on the editor.
        // The save is already persisted; the local form re-sync below only matters when staying on
        // the page, so it's skipped here. `saving` stays true through the client-side navigation
        // (like the create page), which also blocks a double-submit while it resolves.
        router.push(`/panel/school/${id}/tools/${toolId}/manage`);
        return;
      }
      // The local persisted bases (the Input shapes are structurally the stored shapes).
      const savedRaffle: RaffleConfig | undefined = raffle
        ? {
            numberCount: RAFFLE_NUMBER_COUNT,
            pricePerNumber: raffle.pricePerNumber,
            currency: raffle.currency,
            prizes: raffle.prizes,
            drawMethod: raffle.drawMethod,
            ...(raffle.drawDate
              ? { drawDate: Timestamp.fromDate(raffle.drawDate) }
              : {}),
          }
        : undefined;
      const savedTour: TourConfig | undefined = tour
        ? {
            stages: tour.stages,
            ...(tour.contactPhone ? { contactPhone: tour.contactPhone } : {}),
          }
        : undefined;
      const savedSale: SaleConfig | undefined = sale
        ? {
            products: sale.products,
            currency: sale.currency,
            ...(sale.contactPhone ? { contactPhone: sale.contactPhone } : {}),
          }
        : undefined;
      const savedService: ServiceConfig | undefined = service
        ? {
            services: service.services,
            currency: service.currency,
            ...(service.contactPhone
              ? { contactPhone: service.contactPhone }
              : {}),
          }
        : undefined;
      // Bingo's input carries eventDate as a Date, so rebuild the stored shape (Timestamp) — the
      // cards manager reads the saved bingo config's format, so this must reflect the just-saved format.
      const savedBingo: BingoConfig | undefined = bingo
        ? {
            format: bingo.format,
            prizes: bingo.prizes,
            // Mirror buildBingoConfig: the board no longer sets patterns, so default them (all
            // shapes, prize-less) for the live event.
            patterns:
              bingo.patterns ??
              BINGO_PATTERNS.map((pattern) => ({ pattern, prize: "" })),
            pricePerCard: bingo.pricePerCard,
            currency: bingo.currency,
            ...(bingo.eventDate
              ? { eventDate: Timestamp.fromDate(bingo.eventDate) }
              : {}),
            ...(bingo.drawMethod ? { drawMethod: bingo.drawMethod } : {}),
            ...(bingo.contactPhone ? { contactPhone: bingo.contactPhone } : {}),
          }
        : undefined;
      // Event's input carries the date as a Date and the map link unsanitized; rebuild the stored
      // shape (Timestamp + scheme-checked mapUrl) so the gallery media card reads the saved event.
      const savedEventMapUrl = event?.mapUrl ? safeExternalUrl(event.mapUrl) : null;
      const savedEvent: EventConfig | undefined = event
        ? {
            ...(event.date ? { date: Timestamp.fromDate(event.date) } : {}),
            ...(event.place ? { place: event.place } : {}),
            ...(savedEventMapUrl ? { mapUrl: savedEventMapUrl } : {}),
            ...(event.photos && event.photos.length > 0
              ? { photos: event.photos }
              : {}),
            ...(event.videoUrl ? { videoUrl: event.videoUrl } : {}),
            ...(event.contactPhone ? { contactPhone: event.contactPhone } : {}),
          }
        : undefined;
      // A pageant navigates away right after saving (the early return above), so it has no
      // persisted-base re-sync down here — only the kinds that stay on the page do.
      // The single generic config for the active kind, mirroring what updateTool stored; a switch
      // to the config-less `other` kind clears it.
      const savedConfig: ToolConfig | undefined =
        type === "raffle"
          ? savedRaffle
          : type === "guided_tour"
            ? savedTour
            : type === "sale"
              ? savedSale
              : type === "service"
                ? savedService
                : type === "bingo"
                  ? savedBingo
                  : type === "event"
                    ? savedEvent
                    : undefined;
      setTool((prev) =>
        prev
          ? {
              ...prev,
              type,
              title: trimmedTitle,
              description: description.trim(),
              status,
              ...(coverUrl ? { coverUrl } : {}),
              // Keep the persisted base in sync so later media ops build on the saved config.
              config: savedConfig,
            }
          : prev,
      );
      // Re-key the editable stages from the saved values (drops empty/unsaved ones, re-marks
      // every surviving stage persisted so its media uploads unlock).
      if (type === "guided_tour" && savedTour) {
        setTourStages(keyTourStages(savedTour.stages));
      }
      // Re-sync the form from the saved value (normalizes the price string back from the number).
      if (type === "sale" && savedSale && savedSale.products.length > 0) {
        const p = savedSale.products[0];
        setSaleForm({
          id: p.id,
          price: String(p.price),
          currency: savedSale.currency,
          contactPhone: savedSale.contactPhone ?? "",
          ...(p.photos && p.photos.length > 0 ? { photos: p.photos } : {}),
          ...(p.videoUrl ? { videoUrl: p.videoUrl } : {}),
        });
      }
      if (type === "service" && savedService && savedService.services.length > 0) {
        const s = savedService.services[0];
        setServiceForm({
          id: s.id,
          price: typeof s.price === "number" ? String(s.price) : "",
          priceFrom: Boolean(s.priceFrom),
          modalities: s.modalities ?? [],
          availability: s.availability ?? "",
          currency: savedService.currency,
          contactPhone: savedService.contactPhone ?? "",
          ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
          ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
        });
      }
      // Re-hydrate the event form from the saved config (the gallery media card reads that config).
      if (type === "event" && savedEvent) {
        setEventForm(eventFormFromConfig(savedEvent));
      }
      setCoverFile(null);
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteTool(id, toolId);
      router.push(`/panel/school/${id}/tools`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar la herramienta."));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // Remove the saved cover right away (confirmed): clear the field, drop it from local state and any
  // half-picked replacement. The public page is ISR, so it catches up on its next revalidate — like
  // every other write here, which is why this needs no on-demand revalidation.
  const onRemoveCover = async () => {
    setError(null);
    setRemovingCover(true);
    try {
      await clearToolCover(id, toolId);
      setTool((prev) => (prev ? { ...prev, coverUrl: undefined } : prev));
      setCoverFile(null);
      setConfirmRemoveCover(false);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar la portada."));
    } finally {
      setRemovingCover(false);
    }
  };

  // ── Guided-tour stage helpers ──────────────────────────────────────────────

  /**
   * Persist a media change (photos and/or the video) on a single SAVED stage immediately,
   * without dragging along any unsaved text edits: start from the persisted base
   * (the saved tour config's stages), apply only this stage's media delta, write just the `config` field, then
   * merge the new media back into the editable stage (matched by _key) so the UI updates while
   * in-progress text stays untouched. Mirrors the project editor's applyMedia. `videoUrl: null`
   * clears the video.
   */
  const applyTourMedia = async (
    key: number,
    media: { photos?: string[]; videoUrl?: string | null },
  ) => {
    const tourBase = toolConfigOf(tool, "guided_tour");
    if (type !== "guided_tour" || !tourBase || !tourPersistedKeys.has(key))
      return;
    setError(null);
    // Persisted editable stages keep the same relative order as the persisted base, so the
    // target's position among them maps onto tourBase.stages.
    const persistedEditable = tourStages.filter((s) =>
      tourPersistedKeys.has(s._key),
    );
    const targetIndex = persistedEditable.findIndex((s) => s._key === key);
    if (targetIndex < 0) return;
    // Generic so it preserves a stage's extra fields (the editable stage keeps its `_key`).
    const applyDelta = <T extends TourStage>(s: T): T => {
      const next = { ...s };
      if (media.photos !== undefined) next.photos = media.photos;
      if (media.videoUrl !== undefined) {
        if (media.videoUrl) next.videoUrl = media.videoUrl;
        else delete next.videoUrl;
      }
      return next;
    };
    const nextStages: TourStage[] = tourBase.stages.map((s, i) =>
      i === targetIndex ? applyDelta(s) : s,
    );
    await updateToolTour(id, toolId, {
      stages: nextStages,
      ...(tourBase.contactPhone ? { contactPhone: tourBase.contactPhone } : {}),
    });
    // Refresh the persisted base (functional updater so a concurrent save isn't clobbered).
    setTool((prev) => {
      const base = toolConfigOf(prev, "guided_tour");
      return prev && base
        ? { ...prev, config: { ...base, stages: nextStages } }
        : prev;
    });
    // Merge the media into the editable stage, preserving its live text.
    setTourStages((prev) =>
      prev.map((s) => (s._key === key ? applyDelta(s) : s)),
    );
  };

  /**
   * Remove a stage. A persisted stage is written immediately FROM the persisted base, so
   * unsaved text on other stages isn't committed; an unsaved stage is just dropped locally.
   */
  const removeTourStage = async (key: number) => {
    if (type !== "guided_tour") return;
    setError(null);
    if (!tourPersistedKeys.has(key)) {
      setTourStages((prev) => prev.filter((s) => s._key !== key));
      setTourRemoveKey(null);
      return;
    }
    const tourBase = toolConfigOf(tool, "guided_tour");
    if (!tourBase) return;
    const persistedEditable = tourStages.filter((s) =>
      tourPersistedKeys.has(s._key),
    );
    const targetIndex = persistedEditable.findIndex((s) => s._key === key);
    if (targetIndex < 0) return;
    const nextStages = tourBase.stages.filter((_, i) => i !== targetIndex);
    setTourRemoving(true);
    try {
      await updateToolTour(id, toolId, {
        stages: nextStages,
        ...(tourBase.contactPhone
          ? { contactPhone: tourBase.contactPhone }
          : {}),
      });
      setTool((prev) => {
        const base = toolConfigOf(prev, "guided_tour");
        return prev && base
          ? { ...prev, config: { ...base, stages: nextStages } }
          : prev;
      });
      setTourStages((prev) => prev.filter((s) => s._key !== key));
      setTourPersistedKeys((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
      setTourRemoveKey(null);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo quitar la etapa."));
    } finally {
      setTourRemoving(false);
    }
  };

  const addTourStage = () => {
    setTourStages((prev) => [
      ...prev,
      { title: "", description: "", _key: nextTourKey.current++ },
    ]);
    setDirty(true);
  };

  // Sale ("Productos") has no per-item helpers: a single product edits through the shared
  // SaleProductsEditor (same as create), and its media saves with the form, not immediately.

  // Service ("Servicios") has no per-item helpers: a single service edits through the shared
  // ServiceItemsEditor (same as create), and its media saves with the form, not immediately.

  // ── Event ("Eventos") gallery helper ───────────────────────────────────────
  // The event has a single gallery (not a list), so its media persists immediately against the
  // persisted base (the saved event config) — an in-progress, unsaved date/place/map edit is never dragged
  // along. Mirrors the tour stage media, but for one config object instead of an item in a list.

  const applyEventMedia = async (media: {
    photos?: string[];
    videoUrl?: string | null;
  }) => {
    const eventBase = toolConfigOf(tool, "event");
    if (type !== "event" || !eventBase) return;
    setError(null);
    const base = eventBase;
    const nextPhotos =
      media.photos !== undefined ? media.photos : (base.photos ?? []);
    const nextVideo =
      media.videoUrl !== undefined
        ? media.videoUrl ?? undefined
        : base.videoUrl;
    // Rebuild the input from the PERSISTED base (not the live form) so unsaved text isn't written.
    await updateToolEvent(id, toolId, {
      date: base.date ? base.date.toDate() : null,
      ...(base.place ? { place: base.place } : {}),
      ...(base.mapUrl ? { mapUrl: base.mapUrl } : {}),
      ...(base.contactPhone ? { contactPhone: base.contactPhone } : {}),
      photos: nextPhotos,
      ...(nextVideo ? { videoUrl: nextVideo } : {}),
    });
    setTool((prev) => {
      const base2 = toolConfigOf(prev, "event");
      return prev && base2
        ? {
            ...prev,
            config: {
              ...base2,
              photos: nextPhotos,
              ...(nextVideo ? { videoUrl: nextVideo } : { videoUrl: undefined }),
            },
          }
        : prev;
    });
  };

  // The stage targeted by the open remove dialog, for its impact summary.
  const tourRemoveTarget =
    tourRemoveKey === null
      ? null
      : tourStages.find((s) => s._key === tourRemoveKey);

  // Typed per-kind config for the render (tool is non-null past the guards above).
  const saleConfig = toolConfigOf(tool, "sale");
  const bingoConfig = toolConfigOf(tool, "bingo");
  const eventConfig = toolConfigOf(tool, "event");

  // A reinado/rifa edit page is reached from that tool's per-instance management panel (via the
  // "Editar …" button there), so its back link returns to that panel; the other kinds have no such
  // panel, so they return to the kind's list.
  const hasManagePanel = type === "pageant" || type === "raffle";
  const editBackHref = hasManagePanel
    ? `/panel/school/${id}/tools/${toolId}/manage`
    : `/panel/school/${id}/tools/manage/${type}`;
  const editBackLabel = hasManagePanel
    ? "Volver a la gestión"
    : `Volver a ${toolTypeMeta(type).pluralLabel}`;

  return (
    <main>
      <Heading
        schoolId={id}
        title={editToolTitle(type)}
        subtitle={school.name}
        backHref={editBackHref}
        backLabel={editBackLabel}
      />

      <form
        id="tool-edit-form"
        onSubmit={onSave}
        onChange={() => setDirty(true)}
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
          />
        </Field>

        <Field label="Descripción">
          <textarea
            rows={4}
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
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Etapas de la visita guiada
              </h2>
              <p className="text-xs text-muted">
                El público las verá en orden. Las fotos y el video de cada etapa
                se guardan al instante; los textos, al guardar los cambios.
              </p>
            </div>

            {tourStages.map((stage, i) => (
              <TourStageCard
                key={stage._key}
                stage={stage}
                index={i}
                schoolId={id}
                toolId={toolId}
                canRemove={tourStages.length > 1}
                // An unsaved stage has no slot in tour.stages yet, so its media can't persist;
                // the card disables uploads and explains why until the stage is saved.
                persisted={tourPersistedKeys.has(stage._key)}
                onText={(patch) => {
                  setTourStages((prev) =>
                    prev.map((s) =>
                      s._key === stage._key ? { ...s, ...patch } : s,
                    ),
                  );
                  setDirty(true);
                }}
                onMedia={(media) => applyTourMedia(stage._key, media)}
                onRemove={() => setTourRemoveKey(stage._key)}
              />
            ))}

            {tourStages.length < TOUR_STAGE_MAX ? (
              <button
                type="button"
                onClick={addTourStage}
                className="btn btn-outline self-start"
              >
                Agregar etapa
              </button>
            ) : (
              <span className="text-xs text-muted">
                Máximo {TOUR_STAGE_MAX} etapas.
              </span>
            )}
          </section>
        )}

        {type === "sale" && (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                Detalles del producto
              </p>
              {saleConfig && (
                <Link
                  href={`/panel/school/${id}/product-orders`}
                  className="text-sm font-medium text-brand-darker hover:underline"
                >
                  Confirmar pedidos
                </Link>
              )}
            </div>
            <SaleProductsEditor
              value={saleForm}
              onChange={(action) => {
                setSaleForm(action);
                setDirty(true);
              }}
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
              onChange={(action) => {
                setServiceForm(action);
                setDirty(true);
              }}
              schoolId={id}
              toolId={toolId}
            />
          </div>
        )}

        {type === "bingo" && (
          <section className="flex flex-col gap-4">
            {/* Launch the live game from inside the tool it belongs to (only once the bingo is
                saved — the console reads the saved bingo config's format to draw the board). */}
            {bingoConfig && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-tint p-4 ring-1 ring-brand/10">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Bingo en vivo
                  </p>
                  <p className="text-xs text-muted">
                    Dirige el juego: canta los números y valida los reclamos en
                    tiempo real.
                  </p>
                </div>
                <Link
                  href={`/panel/school/${id}/bingo-live?tool=${toolId}`}
                  className="btn btn-primary shrink-0"
                >
                  Dirigir en vivo
                </Link>
              </div>
            )}
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Configuración del bingo
              </p>
              <BingoConfigFields
                value={bingoForm}
                onChange={setBingoForm}
                hideFormat
              />
            </div>
            {/* Cartones live in a reusable mazo (deck) — the single place to create/edit them. A
                bingo binds its lote by choosing a mazo at creation, so the edit page only links out
                (no generate/import here). */}
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="text-sm font-semibold text-foreground">Cartones (mazo)</p>
              <p className="mt-1 text-xs text-muted">
                Los cartones de este bingo se definen eligiendo un mazo al crearlo. Para
                generarlos, importarlos o ver todos los cartones, administra tus mazos en
                su propia página.
              </p>
              <p className="mt-2 text-xs">
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
          </section>
        )}

        {type === "event" && (
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Datos del evento
              </p>
              <EventConfigFields value={eventForm} onChange={setEventForm} />
            </div>
            {eventConfig ? (
              <ToolItemCard
                title="Fotos y video del evento"
                removeLabel=""
                canRemove={false}
                onRemove={() => {}}
                photos={eventConfig.photos ?? []}
                videoUrl={eventConfig.videoUrl}
                photoMax={EVENT_PHOTO_MAX}
                schoolId={id}
                toolId={toolId}
                persisted
                unsavedHint=""
                onMedia={applyEventMedia}
              >
                <p className="text-xs text-muted">
                  Una pequeña galería para mostrar el evento (las fotos y el video se
                  guardan al instante).
                </p>
              </ToolItemCard>
            ) : (
              <p className="text-xs text-muted">
                Guarda el evento para subir fotos y un video.
              </p>
            )}
          </section>
        )}

        {type === "pageant" && (
          // The live gala (phases, reveal, crown) lives on the reinado's management panel — the
          // control surface the board lands on from its card; this editor is reached from there via
          // "Editar reinado", so it stays focused on configuration only.
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Configuración del reinado
              </p>
              <PageantConfigFields value={pageantForm} onChange={setPageantForm} />
              <p className="mt-3 text-xs text-muted">
                Las candidatas o candidatos se administran más abajo, en «Candidaturas».
              </p>
            </div>
          </section>
        )}

        {/* Existing cover preview (the picker only previews a NEW file). */}
        {tool.coverUrl && !coverFile && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Portada actual
            </p>
            <span
              className={`relative block w-full overflow-hidden rounded-xl bg-surface ring-1 ring-black/5 ${CARD_COVER_ASPECT}`}
            >
              <Image
                src={tool.coverUrl}
                alt=""
                fill
                sizes={CARD_COVER_SIZES}
                className="object-cover"
              />
            </span>
          </div>
        )}
        <ImagePicker
          label={tool.coverUrl ? "Reemplazar portada" : "Portada"}
          // With a saved cover, the "Portada actual" block above already names the field and the
          // remove action exists, so the "…Opcional." caption (and the label) would be misleading —
          // hide both; with no cover yet it's genuinely optional, so keep them.
          hint={tool.coverUrl ? undefined : "Imagen horizontal. Opcional."}
          hideLabel={Boolean(tool.coverUrl)}
          variant="cover"
          value={coverFile}
          // With a saved cover (shown as "Portada actual" above), skip the empty 5:2 band and show
          // just the change button + the "Eliminar portada" action; with no cover yet, keep the band
          // (the picker is the only surface).
          hidePreviewWhenEmpty={Boolean(tool.coverUrl)}
          pickLabel={tool.coverUrl ? "Cambiar portada" : "Subir imagen"}
          onRemoveExisting={
            tool.coverUrl ? () => setConfirmRemoveCover(true) : undefined
          }
          removeLabel="Eliminar portada"
          onChange={(f) => {
            setCoverFile(f);
            setDirty(true);
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp para consultas (opcional)">
            <input
              type="tel"
              inputMode="tel"
              value={contactPhone}
              onChange={(e) => {
                setContactPhone(e.target.value);
                setDirty(true);
              }}
              className="input"
              placeholder="Ej.: 8888 8888"
            />
          </Field>
          <Field label="Texto del botón (opcional)">
            <input
              type="text"
              maxLength={TOOL_CONTACT_LABEL_MAX}
              value={contactLabel}
              onChange={(e) => {
                setContactLabel(e.target.value);
                setDirty(true);
              }}
              className="input"
              placeholder="Consultar"
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">
          El botón “{contactLabel.trim() || "Consultar"}” de la página abrirá WhatsApp con este
          número. Si lo dejas en blanco, usa el teléfono de la junta de la escuela.
        </p>

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

      </form>

      {/* Pageant roster: the candidate subcollection. Edited here but persisted with the tool form's
          "Guardar cambios" (the editor exposes validate()/saveAll(), driven by onSave). Same card
          convention + same PageantCandidatesEditor the create page uses. */}
      {type === "pageant" && (
        <section className="mt-10 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
          <p className="mb-1 text-sm font-semibold text-foreground">Candidaturas</p>
          <p className="mb-3 text-xs text-muted">
            El público las verá en la página del reinado. Los cambios se guardan con «Guardar
            cambios».
          </p>
          <PageantCandidatesEditor
            ref={candidatesRef}
            schoolId={id}
            toolId={toolId}
            onDirty={() => setDirty(true)}
          />
        </section>
      )}

      {/* Padrinazgo del reinado (opcional) — the LAST pageant section. Opting in auto-creates a
          single-stage destination project that the public "Apadrinar el reinado" CTA funds; the board
          only types the goal, everything else is derived from the reinado on save. An already-linked
          reinado shows the project read-only (the link is preserved on save). */}
      {type === "pageant" && (
        <section className="mt-10 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
          <p className="mb-1 text-sm font-semibold text-foreground">
            Padrinazgo del reinado (opcional)
          </p>
          <p className="mb-3 text-xs text-muted">
            Habilita un botón «Apadrinar el reinado» en la página pública para recibir aportes hacia
            los costos del evento (logística, decoración, etc.).
          </p>

          {existingFundProjectId ? (
            <div className="rounded-xl bg-white p-3 ring-1 ring-black/5">
              <p className="text-sm text-foreground">
                Este reinado ya tiene un proyecto de padrinazgo vinculado.
              </p>
              <p className="mt-2 text-sm">
                <Link
                  href={`/panel/school/${id}/projects/${existingFundProjectId}`}
                  className="font-medium text-brand-darker hover:underline"
                >
                  Gestionar el proyecto (meta, descripción, etapas)
                </Link>
              </p>
            </div>
          ) : (
            <>
              <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-black/5">
                <input
                  type="checkbox"
                  checked={sponsorEnabled}
                  onChange={(e) => {
                    setSponsorEnabled(e.target.checked);
                    setDirty(true);
                  }}
                  className="mt-0.5 size-4"
                />
                <span className="text-sm">
                  <span className="font-medium text-foreground">
                    Recibir padrinazgos para el reinado
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Al guardar se creará un proyecto asociado para recibir los aportes.
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
                      onChange={(e) => {
                        setSponsorGoal(e.target.value);
                        setDirty(true);
                      }}
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
            </>
          )}
        </section>
      )}

      {/* Save / view actions, moved BELOW the kind's extra section (raffle preview, pageant roster)
          so they're the last controls before the risk zone. The submit button lives outside <form>
          and reaches it via the `form` attribute, so it still submits the tool form above. */}
      <div className="mt-10 flex flex-col gap-4">
        <FormError message={error} />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="submit"
            form="tool-edit-form"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <SavedIndicator show={saved} onHide={() => setSaved(false)} />
          <Link href={`/school/${id}/tool/${toolId}`} className="btn btn-outline">
            Ver público
          </Link>
        </div>
      </div>

      {/* Risk zone: deleting a tool is irreversible. A centered RED text action (not a button — like
          "Eliminar portada", but red); its label names the kind ("Eliminar reinado"), and the confirm
          dialog carries the warning + names this specific activity, so it's clear it removes only THIS
          one. Kept under a divider so it reads as a risk zone. */}
      <section className="mt-12 flex justify-center border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-sm font-medium text-error underline-offset-2 transition-colors hover:underline"
        >
          {deleteToolTitle(type)}
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title={deleteToolTitle(type)}
        tone="destructive"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        busy={deleting}
        busyLabel="Eliminando…"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          Vas a eliminar «{tool.title}» de la página de la escuela. Esta acción no se puede
          deshacer.
        </p>
      </ConfirmDialog>

      {/* Remove the saved cover — confirmed; the board can upload another afterwards. */}
      <ConfirmDialog
        open={confirmRemoveCover}
        title="Eliminar portada"
        tone="destructive"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        busy={removingCover}
        busyLabel="Eliminando…"
        onConfirm={onRemoveCover}
        onCancel={() => setConfirmRemoveCover(false)}
      >
        <p>
          Se quita la imagen de portada de «{tool.title}». Podrás subir otra cuando quieras.
        </p>
      </ConfirmDialog>

      {/* Remove a tour stage — confirmed, with concrete impact (its media count). */}
      <ConfirmDialog
        open={tourRemoveKey !== null}
        title="Quitar etapa"
        tone="destructive"
        confirmLabel="Quitar etapa"
        cancelLabel="Cancelar"
        busy={tourRemoving}
        busyLabel="Quitando…"
        onConfirm={() => {
          if (tourRemoveKey !== null) removeTourStage(tourRemoveKey);
        }}
        onCancel={() => setTourRemoveKey(null)}
      >
        {tourRemoveTarget && (
          <p>
            Vas a quitar «{tourRemoveTarget.title.trim() || "Etapa sin título"}».
            Tiene {tourRemoveTarget.photos?.length ?? 0}{" "}
            {(tourRemoveTarget.photos?.length ?? 0) === 1 ? "foto" : "fotos"}
            {tourRemoveTarget.videoUrl ? " y un video" : ""}. No se puede deshacer.
          </p>
        )}
      </ConfirmDialog>

      <p className="mt-8 text-sm">
        <BackLink href={editBackHref}>{editBackLabel}</BackLink>
      </p>
    </main>
  );
}

/**
 * One guided-tour stage on the edit page: the stage's text fields inside the shared ToolItemCard
 * (which carries the media block + immediate, validated photo/video uploads). Media is keyed to
 * the persisted `tour.stages` array, so an unsaved stage shows the hint until it's saved — mirrors
 * the project editor's StageCard.
 */
function TourStageCard({
  stage,
  index,
  schoolId,
  toolId,
  canRemove,
  persisted,
  onText,
  onMedia,
  onRemove,
}: {
  stage: EditableTourStage;
  index: number;
  schoolId: string;
  toolId: string;
  canRemove: boolean;
  /** Whether this stage is saved in Firestore; unsaved stages can't receive media. */
  persisted: boolean;
  onText: (patch: Partial<Pick<TourStage, "title" | "description">>) => void;
  onMedia: (media: {
    photos?: string[];
    videoUrl?: string | null;
  }) => Promise<void>;
  onRemove: () => void;
}) {
  return (
    <ToolItemCard
      title={`Etapa ${index + 1}`}
      removeLabel="Quitar etapa"
      canRemove={canRemove}
      onRemove={onRemove}
      photos={stage.photos ?? []}
      videoUrl={stage.videoUrl}
      photoMax={TOUR_STAGE_PHOTO_MAX}
      schoolId={schoolId}
      toolId={toolId}
      persisted={persisted}
      unsavedHint="Guarda la etapa para poder subir fotos y un video."
      onMedia={onMedia}
    >
      <Field label="Nombre de la etapa">
        <input
          type="text"
          maxLength={TOUR_STAGE_TITLE_MAX}
          value={stage.title}
          onChange={(e) => onText({ title: e.target.value })}
          className="input"
          placeholder="Ej.: Breve historia de la escuela"
        />
      </Field>
      <Field label="¿Qué incluye?">
        <textarea
          rows={3}
          maxLength={TOUR_STAGE_DESCRIPTION_MAX}
          value={stage.description}
          onChange={(e) => onText({ description: e.target.value })}
          className="input"
          placeholder="Cuenta qué se ve y se hace en esta etapa."
        />
      </Field>
    </ToolItemCard>
  );
}

