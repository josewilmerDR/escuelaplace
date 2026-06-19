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
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import {
  RaffleConfigFields,
  emptyRaffleForm,
  raffleFormFromConfig,
  toRaffleInput,
  type RaffleFormValue,
} from "@/components/tools/RaffleConfigFields";
import {
  RaffleNumberGrid,
  RaffleNumberLegend,
} from "@/components/tools/RaffleNumberGrid";
import { newProductId } from "@/components/tools/SaleProductsEditor";
import { newServiceId } from "@/components/tools/ServiceItemsEditor";
import { ToolTypePicker } from "@/components/tools/ToolTypePicker";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker, validateImageFile } from "@/components/ui/ImagePicker";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { XMarkIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { validateVideoFile, videoDurationSeconds } from "@/lib/files";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { CARD_COVER_ASPECT, CARD_COVER_SIZES } from "@/lib/layout";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { safeExternalUrl } from "@/lib/url";
import {
  deleteTool,
  getRaffleOrdersByTool,
  getSchoolById,
  getToolById,
  raffleNumberStates,
  toolDateFromInput,
  toolDateInputValue,
  updateTool,
  updateToolSale,
  updateToolService,
  updateToolTour,
  uploadToolCover,
  uploadToolStageAsset,
  type SaleConfigInput,
  type ServiceConfigInput,
  type TourConfigInput,
} from "@/lib/firestore";
import {
  PROJECT_CURRENCIES,
  SALE_PRODUCT_DESCRIPTION_MAX,
  SALE_PRODUCT_MAX,
  SALE_PRODUCT_NAME_MAX,
  SALE_PRODUCT_PHOTO_MAX,
  SERVICE_DESCRIPTION_MAX,
  SERVICE_ITEM_MAX,
  SERVICE_NAME_MAX,
  SERVICE_PHOTO_MAX,
  TOOL_CTA_LABEL_MAX,
  TOOL_DESCRIPTION_MAX,
  TOOL_TITLE_MAX,
  TOUR_STAGE_DESCRIPTION_MAX,
  TOUR_STAGE_MAX,
  TOUR_STAGE_PHOTO_MAX,
  TOUR_STAGE_TITLE_MAX,
  TOOL_VIDEO_MAX_MB,
  TOOL_VIDEO_MAX_SECONDS,
  type ProjectCurrency,
  type RaffleOrderDoc,
  type SaleConfig,
  type SaleProduct,
  type SchoolDoc,
  type ServiceConfig,
  type ServiceItem,
  type ToolDoc,
  type ToolStatus,
  type ToolType,
  type TourConfig,
  type TourStage,
} from "@/types";

type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando herramienta…";

function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Editar herramienta
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

/**
 * A guided-tour stage with a stable local-only id, so React keys the cards on identity rather
 * than array index (else removing one stage would reattach a card's local state to the wrong
 * stage). `_key` is stripped before writing — the doc only stores title/description/photos/
 * videoUrl. Mirrors the project editor's EditableStage.
 */
type EditableTourStage = TourStage & { _key: number };

/**
 * A sale product as the edit form holds it: price is a STRING while editing (a controlled
 * number input drops the decimal point mid-type), parsed back to a number on save. The stable
 * `id` doubles as the React key and the media/removal match key.
 */
type EditableSaleProduct = Omit<SaleProduct, "price"> & { price: string };

/** A sale service as the edit form holds it: same string-price design as EditableSaleProduct,
 * but the price is genuinely OPTIONAL (blank = quote-based). */
type EditableServiceItem = Omit<ServiceItem, "price"> & { price: string };

export default function EditToolPage() {
  const { id, toolId } = useParams<{ id: string; toolId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const justCreated = useSearchParams().get("created") === "1";

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tool, setTool] = useState<ToolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Editable fields
  const [type, setType] = useState<ToolType>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ToolStatus>("active");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [raffleForm, setRaffleForm] = useState<RaffleFormValue>(emptyRaffleForm);
  // Raffle orders, only for the read-only grid preview shown to the board.
  const [orders, setOrders] = useState<RaffleOrderDoc[]>([]);

  // Guided-tour editable state. Stage text + the contact phone save with the form button; stage
  // media (photos/video) persists immediately, the way the project editor handles stage media.
  const [tourStages, setTourStages] = useState<EditableTourStage[]>([]);
  const [tourPhone, setTourPhone] = useState("");
  // Deterministic monotonic counter for stable stage ids (no Math.random/Date.now).
  const nextTourKey = useRef(0);
  // Keys of stages currently persisted in Firestore — a media upload can only target a saved
  // stage (it writes against tool.tour.stages), so a brand-new unsaved stage disables uploads
  // until "Guardar cambios" persists and re-keys it (mirrors the project editor).
  const [tourPersistedKeys, setTourPersistedKeys] = useState<Set<number>>(
    new Set(),
  );
  // The stage pending removal confirmation (its _key), or null when no dialog is open.
  const [tourRemoveKey, setTourRemoveKey] = useState<number | null>(null);
  const [tourRemoving, setTourRemoving] = useState(false);

  // Sale ("Productos") editable state. Each product carries a STABLE id, so media ops and
  // removal match by id (no positional mapping needed, unlike tour stages). Text/price + the
  // currency + the contact phone save with the form button; media persists immediately.
  const [saleProducts, setSaleProducts] = useState<EditableSaleProduct[]>([]);
  const [saleCurrency, setSaleCurrency] = useState<ProjectCurrency>("CRC");
  const [salePhone, setSalePhone] = useState("");
  const [saleRemoveId, setSaleRemoveId] = useState<string | null>(null);
  const [saleRemoving, setSaleRemoving] = useState(false);

  // Service ("Servicios") editable state — same shape as sale, minus the order flow. Price is
  // optional per service.
  const [serviceItems, setServiceItems] = useState<EditableServiceItem[]>([]);
  const [serviceCurrency, setServiceCurrency] =
    useState<ProjectCurrency>("CRC");
  const [servicePhone, setServicePhone] = useState("");
  const [serviceRemoveId, setServiceRemoveId] = useState<string | null>(null);
  const [serviceRemoving, setServiceRemoving] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    Promise.all([
      getSchoolById(id),
      getToolById(id, toolId),
      getRaffleOrdersByTool(toolId).catch(() => []),
    ])
      .then(([s, t, o]) => {
        setSchool(s);
        setTool(t);
        setOrders(o);
        if (t) {
          setType(t.type);
          setTitle(t.title);
          setDescription(t.description);
          setStatus(t.status);
          setStartsAt(toolDateInputValue(t.startsAt));
          setEndsAt(toolDateInputValue(t.endsAt));
          setCtaLabel(t.cta?.label ?? "");
          setCtaUrl(t.cta?.url ?? "");
          if (t.raffle) setRaffleForm(raffleFormFromConfig(t.raffle));
          if (t.tour) {
            setTourStages(keyTourStages(t.tour.stages));
            setTourPhone(t.tour.contactPhone ?? "");
          }
          if (t.sale) {
            setSaleProducts(
              t.sale.products.map((p) => ({ ...p, price: String(p.price) })),
            );
            setSaleCurrency(t.sale.currency);
            setSalePhone(t.sale.contactPhone ?? "");
          }
          if (t.service) {
            setServiceItems(
              t.service.services.map((s) => ({
                ...s,
                price: typeof s.price === "number" ? String(s.price) : "",
              })),
            );
            setServiceCurrency(t.service.currency);
            setServicePhone(t.service.contactPhone ?? "");
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
        <Heading />
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
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la herramienta. Revisá tu conexión e intentá de nuevo.
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
        <Heading />
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
        <Heading subtitle={school.name} />
        <p className="mt-4 text-sm text-muted">No administrás esta escuela.</p>
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
      setError("Ingresá el título de la herramienta.");
      return;
    }
    // The CTA is all-or-nothing: a label without a link (or vice versa) is incomplete, and a
    // link must be a safe http(s) URL — caught here so the board gets a clear message instead
    // of a silently dropped button.
    const label = ctaLabel.trim();
    const url = ctaUrl.trim();
    if ((label && !url) || (!label && url)) {
      setError(
        "El botón necesita tanto un texto como un enlace; completá ambos o dejá los dos en blanco.",
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
    // A raffle carries its own config — validate it (only when the tool is a raffle).
    const raffleResult = type === "raffle" ? toRaffleInput(raffleForm) : null;
    if (raffleResult && !raffleResult.ok) {
      setError(raffleResult.error);
      return;
    }
    const raffle = raffleResult?.ok ? raffleResult.input : undefined;

    // A guided tour carries its ordered stages (text + already-uploaded media) and contact
    // phone. Build it from the editable stages; require at least one named stage. Empty stages
    // (no title, description or media — e.g. an "Agregar etapa" never filled) are dropped.
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
        setError("Agregá al menos una etapa con su nombre.");
        return;
      }
      if (cleanStages.some((s) => !s.title)) {
        setError("Cada etapa necesita un nombre.");
        return;
      }
      const phone = tourPhone.trim();
      tour = { stages: cleanStages, ...(phone ? { contactPhone: phone } : {}) };
    }

    // A product catalog carries its products (text + price + already-uploaded media), the
    // currency and the contact. Require at least one product with a name and a price > 0; empty
    // products (nothing filled — e.g. an "Agregar producto" never completed) are dropped.
    let sale: SaleConfigInput | undefined;
    if (type === "sale") {
      const cleanProducts = saleProducts
        .map((p) => ({
          id: p.id,
          name: p.name.trim(),
          description: p.description.trim(),
          price: Number(p.price),
          ...(p.photos && p.photos.length > 0 ? { photos: p.photos } : {}),
          ...(p.videoUrl ? { videoUrl: p.videoUrl } : {}),
        }))
        .filter(
          (p) =>
            p.name ||
            p.description ||
            p.price > 0 ||
            (p.photos?.length ?? 0) > 0 ||
            Boolean(p.videoUrl),
        );
      if (cleanProducts.length === 0) {
        setError("Agregá al menos un producto con su nombre y precio.");
        return;
      }
      for (const p of cleanProducts) {
        if (!p.name) {
          setError("Cada producto necesita un nombre.");
          return;
        }
        if (!Number.isFinite(p.price) || p.price <= 0) {
          setError(`Ingresá un precio mayor a 0 para «${p.name}».`);
          return;
        }
      }
      const phone = salePhone.trim();
      sale = {
        products: cleanProducts,
        currency: saleCurrency,
        ...(phone ? { contactPhone: phone } : {}),
      };
    }

    // A service catalog: like sale, but the price is optional (blank = quote-based).
    let service: ServiceConfigInput | undefined;
    if (type === "service") {
      const cleaned = serviceItems
        .map((s) => ({
          id: s.id,
          name: s.name.trim(),
          description: s.description.trim(),
          priceStr: s.price.trim(),
          photos: s.photos,
          videoUrl: s.videoUrl,
        }))
        .filter(
          (s) =>
            s.name ||
            s.description ||
            s.priceStr ||
            (s.photos?.length ?? 0) > 0 ||
            Boolean(s.videoUrl),
        );
      if (cleaned.length === 0) {
        setError("Agregá al menos un servicio con su nombre.");
        return;
      }
      for (const s of cleaned) {
        if (!s.name) {
          setError("Cada servicio necesita un nombre.");
          return;
        }
        if (s.priceStr) {
          const price = Number(s.priceStr);
          if (!Number.isFinite(price) || price <= 0) {
            setError(
              `El precio de «${s.name}» debe ser mayor a 0 (o dejalo en blanco).`,
            );
            return;
          }
        }
      }
      const phone = servicePhone.trim();
      service = {
        services: cleaned.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          ...(s.priceStr ? { price: Number(s.priceStr) } : {}),
          ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
          ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
        })),
        currency: serviceCurrency,
        ...(phone ? { contactPhone: phone } : {}),
      };
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      let coverUrl: string | undefined;
      if (coverFile) {
        coverUrl = await uploadToolCover(id, toolId, coverFile);
      }
      const cta = label && url ? { label, url } : null;
      await updateTool(id, toolId, {
        type,
        title: trimmedTitle,
        description: description.trim(),
        status,
        ...(coverUrl ? { coverUrl } : {}),
        startsAt: start,
        endsAt: end,
        cta,
        ...(raffle ? { raffle } : {}),
        ...(tour ? { tour } : {}),
        ...(sale ? { sale } : {}),
        ...(service ? { service } : {}),
      });
      // The local persisted bases (the Input shapes are structurally the stored shapes).
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
      setTool((prev) =>
        prev
          ? {
              ...prev,
              type,
              title: trimmedTitle,
              description: description.trim(),
              status,
              ...(coverUrl ? { coverUrl } : {}),
              // Keep the persisted bases in sync so later media ops build on saved items; a
              // switch away from a kind drops its config (updateTool deleted it on the doc).
              tour: type === "guided_tour" ? savedTour : undefined,
              sale: type === "sale" ? savedSale : undefined,
              service: type === "service" ? savedService : undefined,
            }
          : prev,
      );
      // Re-key the editable stages from the saved values (drops empty/unsaved ones, re-marks
      // every surviving stage persisted so its media uploads unlock).
      if (type === "guided_tour" && savedTour) {
        setTourStages(keyTourStages(savedTour.stages));
        setTourPhone(savedTour.contactPhone ?? "");
      }
      // Re-sync the editable products from the saved values (drops empty/unsaved ones; every
      // surviving product is now persisted so its media uploads unlock).
      if (type === "sale" && savedSale) {
        setSaleProducts(
          savedSale.products.map((p) => ({ ...p, price: String(p.price) })),
        );
        setSaleCurrency(savedSale.currency);
        setSalePhone(savedSale.contactPhone ?? "");
      }
      if (type === "service" && savedService) {
        setServiceItems(
          savedService.services.map((s) => ({
            ...s,
            price: typeof s.price === "number" ? String(s.price) : "",
          })),
        );
        setServiceCurrency(savedService.currency);
        setServicePhone(savedService.contactPhone ?? "");
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

  // ── Guided-tour stage helpers ──────────────────────────────────────────────

  /**
   * Persist a media change (photos and/or the video) on a single SAVED stage immediately,
   * without dragging along any unsaved text edits: start from the persisted base
   * (tool.tour.stages), apply only this stage's media delta, write just the `tour` field, then
   * merge the new media back into the editable stage (matched by _key) so the UI updates while
   * in-progress text stays untouched. Mirrors the project editor's applyMedia. `videoUrl: null`
   * clears the video.
   */
  const applyTourMedia = async (
    key: number,
    media: { photos?: string[]; videoUrl?: string | null },
  ) => {
    if (type !== "guided_tour" || !tool?.tour || !tourPersistedKeys.has(key))
      return;
    setError(null);
    // Persisted editable stages keep the same relative order as the persisted base, so the
    // target's position among them maps onto tool.tour.stages.
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
    const nextStages: TourStage[] = tool.tour.stages.map((s, i) =>
      i === targetIndex ? applyDelta(s) : s,
    );
    await updateToolTour(id, toolId, {
      stages: nextStages,
      ...(tool.tour.contactPhone ? { contactPhone: tool.tour.contactPhone } : {}),
    });
    // Refresh the persisted base (functional updater so a concurrent save isn't clobbered).
    setTool((prev) =>
      prev && prev.tour
        ? { ...prev, tour: { ...prev.tour, stages: nextStages } }
        : prev,
    );
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
    if (!tool?.tour) return;
    const persistedEditable = tourStages.filter((s) =>
      tourPersistedKeys.has(s._key),
    );
    const targetIndex = persistedEditable.findIndex((s) => s._key === key);
    if (targetIndex < 0) return;
    const nextStages = tool.tour.stages.filter((_, i) => i !== targetIndex);
    setTourRemoving(true);
    try {
      await updateToolTour(id, toolId, {
        stages: nextStages,
        ...(tool.tour.contactPhone
          ? { contactPhone: tool.tour.contactPhone }
          : {}),
      });
      setTool((prev) =>
        prev && prev.tour
          ? { ...prev, tour: { ...prev.tour, stages: nextStages } }
          : prev,
      );
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

  // ── Sale ("Productos") product helpers ─────────────────────────────────────
  // Products carry a stable id, so media ops/removal match by id directly (no positional
  // mapping). A product is "persisted" iff its id is in tool.sale.products; media can only
  // attach to a persisted product (a freshly-added one persists on "Guardar cambios").

  /** Persist a media change on a single SAVED product immediately, from the persisted base, so
   * an in-progress text/price edit isn't dragged along. Mirrors applyTourMedia. */
  const applySaleMedia = async (
    productId: string,
    media: { photos?: string[]; videoUrl?: string | null },
  ) => {
    if (type !== "sale" || !tool?.sale) return;
    if (!tool.sale.products.some((p) => p.id === productId)) return;
    setError(null);
    // Constrained on just the media fields so it applies to both the persisted base (SaleProduct,
    // numeric price) and the editable copy (EditableSaleProduct, string price), preserving each
    // one's other fields (notably the editable copy's in-progress text/price).
    const applyDelta = <T extends { photos?: string[]; videoUrl?: string }>(
      p: T,
    ): T => {
      const next = { ...p };
      if (media.photos !== undefined) next.photos = media.photos;
      if (media.videoUrl !== undefined) {
        if (media.videoUrl) next.videoUrl = media.videoUrl;
        else delete next.videoUrl;
      }
      return next;
    };
    const nextProducts: SaleProduct[] = tool.sale.products.map((p) =>
      p.id === productId ? applyDelta(p) : p,
    );
    await updateToolSale(id, toolId, {
      products: nextProducts,
      currency: tool.sale.currency,
      ...(tool.sale.contactPhone ? { contactPhone: tool.sale.contactPhone } : {}),
    });
    setTool((prev) =>
      prev && prev.sale
        ? { ...prev, sale: { ...prev.sale, products: nextProducts } }
        : prev,
    );
    setSaleProducts((prev) =>
      prev.map((p) => (p.id === productId ? applyDelta(p) : p)),
    );
  };

  /** Remove a product. A persisted one is written immediately from the persisted base; an
   * unsaved one is just dropped locally. */
  const removeSaleProduct = async (productId: string) => {
    if (type !== "sale") return;
    setError(null);
    if (!tool?.sale?.products.some((p) => p.id === productId)) {
      setSaleProducts((prev) => prev.filter((p) => p.id !== productId));
      setSaleRemoveId(null);
      return;
    }
    const sale = tool.sale;
    const nextProducts = sale.products.filter((p) => p.id !== productId);
    setSaleRemoving(true);
    try {
      await updateToolSale(id, toolId, {
        products: nextProducts,
        currency: sale.currency,
        ...(sale.contactPhone ? { contactPhone: sale.contactPhone } : {}),
      });
      setTool((prev) =>
        prev && prev.sale
          ? { ...prev, sale: { ...prev.sale, products: nextProducts } }
          : prev,
      );
      setSaleProducts((prev) => prev.filter((p) => p.id !== productId));
      setSaleRemoveId(null);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo quitar el producto."));
    } finally {
      setSaleRemoving(false);
    }
  };

  const addSaleProduct = () => {
    setSaleProducts((prev) => [
      ...prev,
      { id: newProductId(), name: "", description: "", price: "" },
    ]);
    setDirty(true);
  };

  // ── Service ("Servicios") helpers — mirror the sale helpers (id-matched media). ─────────

  const applyServiceMedia = async (
    serviceId: string,
    media: { photos?: string[]; videoUrl?: string | null },
  ) => {
    if (type !== "service" || !tool?.service) return;
    if (!tool.service.services.some((s) => s.id === serviceId)) return;
    setError(null);
    const applyDelta = <T extends { photos?: string[]; videoUrl?: string }>(
      s: T,
    ): T => {
      const next = { ...s };
      if (media.photos !== undefined) next.photos = media.photos;
      if (media.videoUrl !== undefined) {
        if (media.videoUrl) next.videoUrl = media.videoUrl;
        else delete next.videoUrl;
      }
      return next;
    };
    const nextServices: ServiceItem[] = tool.service.services.map((s) =>
      s.id === serviceId ? applyDelta(s) : s,
    );
    await updateToolService(id, toolId, {
      services: nextServices,
      currency: tool.service.currency,
      ...(tool.service.contactPhone
        ? { contactPhone: tool.service.contactPhone }
        : {}),
    });
    setTool((prev) =>
      prev && prev.service
        ? { ...prev, service: { ...prev.service, services: nextServices } }
        : prev,
    );
    setServiceItems((prev) =>
      prev.map((s) => (s.id === serviceId ? applyDelta(s) : s)),
    );
  };

  const removeServiceItem = async (serviceId: string) => {
    if (type !== "service") return;
    setError(null);
    if (!tool?.service?.services.some((s) => s.id === serviceId)) {
      setServiceItems((prev) => prev.filter((s) => s.id !== serviceId));
      setServiceRemoveId(null);
      return;
    }
    const svc = tool.service;
    const nextServices = svc.services.filter((s) => s.id !== serviceId);
    setServiceRemoving(true);
    try {
      await updateToolService(id, toolId, {
        services: nextServices,
        currency: svc.currency,
        ...(svc.contactPhone ? { contactPhone: svc.contactPhone } : {}),
      });
      setTool((prev) =>
        prev && prev.service
          ? { ...prev, service: { ...prev.service, services: nextServices } }
          : prev,
      );
      setServiceItems((prev) => prev.filter((s) => s.id !== serviceId));
      setServiceRemoveId(null);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo quitar el servicio."));
    } finally {
      setServiceRemoving(false);
    }
  };

  const addServiceItem = () => {
    setServiceItems((prev) => [
      ...prev,
      { id: newServiceId(), name: "", description: "", price: "" },
    ]);
    setDirty(true);
  };

  // The stage targeted by the open remove dialog, for its impact summary.
  const tourRemoveTarget =
    tourRemoveKey === null
      ? null
      : tourStages.find((s) => s._key === tourRemoveKey);
  const saleRemoveTarget =
    saleRemoveId === null
      ? null
      : saleProducts.find((p) => p.id === saleRemoveId);
  const serviceRemoveTarget =
    serviceRemoveId === null
      ? null
      : serviceItems.find((s) => s.id === serviceRemoveId);

  return (
    <main>
      <Heading subtitle={school.name} />

      <SchoolPanelNav schoolId={id} current="tools" />

      {justCreated && (
        <p className="mt-6 rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10">
          Herramienta creada. Agregale una portada, fechas y un botón si querés, y
          guardá los cambios.
        </p>
      )}

      <form
        onSubmit={onSave}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-4"
      >
        <div>
          <p className="text-sm font-medium text-foreground">
            Tipo de herramienta
          </p>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            Elegí qué tipo de actividad es.
          </p>
          <ToolTypePicker
            value={type}
            onChange={(t) => {
              setType(t);
              setDirty(true);
            }}
          />
        </div>

        <Field label="Título">
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

            <Field label="WhatsApp para consultas (opcional)">
              <input
                type="tel"
                inputMode="tel"
                value={tourPhone}
                onChange={(e) => {
                  setTourPhone(e.target.value);
                  setDirty(true);
                }}
                className="input"
                placeholder="Ej.: 8888 8888"
              />
            </Field>
            <p className="-mt-2 text-xs text-muted">
              El botón “Preguntar” de la página abrirá WhatsApp con este número. Si
              lo dejás en blanco, usa el teléfono de la junta de la escuela.
            </p>
          </section>
        )}

        {type === "sale" && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Productos del catálogo
              </h2>
              {tool.sale && (
                <Link
                  href={`/panel/school/${id}/product-orders`}
                  className="text-sm font-medium text-brand-darker hover:underline"
                >
                  Confirmar pedidos
                </Link>
              )}
            </div>
            <p className="-mt-2 text-xs text-muted">
              El público verá cada producto con su foto, precio y un botón
              “Comprar”. Las fotos y el video se guardan al instante; los textos y
              el precio, al guardar los cambios.
            </p>

            <Field label="Moneda">
              <select
                value={saleCurrency}
                onChange={(e) => {
                  setSaleCurrency(e.target.value as ProjectCurrency);
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

            {saleProducts.map((product, i) => (
              <SaleProductCard
                key={product.id}
                product={product}
                index={i}
                currency={saleCurrency}
                schoolId={id}
                toolId={toolId}
                canRemove={saleProducts.length > 1}
                // An unsaved product has no slot in sale.products yet, so its media can't
                // persist; the card disables uploads until the product is saved.
                persisted={(tool.sale?.products ?? []).some(
                  (p) => p.id === product.id,
                )}
                onText={(patch) => {
                  setSaleProducts((prev) =>
                    prev.map((p) =>
                      p.id === product.id ? { ...p, ...patch } : p,
                    ),
                  );
                  setDirty(true);
                }}
                onMedia={(media) => applySaleMedia(product.id, media)}
                onRemove={() => setSaleRemoveId(product.id)}
              />
            ))}

            {saleProducts.length < SALE_PRODUCT_MAX ? (
              <button
                type="button"
                onClick={addSaleProduct}
                className="btn btn-outline self-start"
              >
                Agregar producto
              </button>
            ) : (
              <span className="text-xs text-muted">
                Máximo {SALE_PRODUCT_MAX} productos.
              </span>
            )}

            <Field label="WhatsApp para consultas (opcional)">
              <input
                type="tel"
                inputMode="tel"
                value={salePhone}
                onChange={(e) => {
                  setSalePhone(e.target.value);
                  setDirty(true);
                }}
                className="input"
                placeholder="Ej.: 8888 8888"
              />
            </Field>
          </section>
        )}

        {type === "service" && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Servicios del catálogo
            </h2>
            <p className="-mt-2 text-xs text-muted">
              El público verá cada servicio con su foto y un botón “Preguntar” por
              WhatsApp. Las fotos y el video se guardan al instante; los textos y el
              precio, al guardar los cambios.
            </p>

            <Field label="Moneda">
              <select
                value={serviceCurrency}
                onChange={(e) => {
                  setServiceCurrency(e.target.value as ProjectCurrency);
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

            {serviceItems.map((service, i) => (
              <ServiceItemCard
                key={service.id}
                service={service}
                index={i}
                currency={serviceCurrency}
                schoolId={id}
                toolId={toolId}
                canRemove={serviceItems.length > 1}
                persisted={(tool.service?.services ?? []).some(
                  (s) => s.id === service.id,
                )}
                onText={(patch) => {
                  setServiceItems((prev) =>
                    prev.map((s) =>
                      s.id === service.id ? { ...s, ...patch } : s,
                    ),
                  );
                  setDirty(true);
                }}
                onMedia={(media) => applyServiceMedia(service.id, media)}
                onRemove={() => setServiceRemoveId(service.id)}
              />
            ))}

            {serviceItems.length < SERVICE_ITEM_MAX ? (
              <button
                type="button"
                onClick={addServiceItem}
                className="btn btn-outline self-start"
              >
                Agregar servicio
              </button>
            ) : (
              <span className="text-xs text-muted">
                Máximo {SERVICE_ITEM_MAX} servicios.
              </span>
            )}

            <Field label="WhatsApp para consultas (opcional)">
              <input
                type="tel"
                inputMode="tel"
                value={servicePhone}
                onChange={(e) => {
                  setServicePhone(e.target.value);
                  setDirty(true);
                }}
                className="input"
                placeholder="Ej.: 8888 8888"
              />
            </Field>
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
          hint="Imagen horizontal. Opcional."
          variant="cover"
          value={coverFile}
          onChange={(f) => {
            setCoverFile(f);
            setDirty(true);
          }}
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
              placeholder="Ej.: Escribinos por WhatsApp"
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

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <SavedIndicator show={saved} onHide={() => setSaved(false)} />
          <Link href={`/school/${id}/tool/${toolId}`} className="btn btn-outline">
            Ver público
          </Link>
        </div>
      </form>

      {type === "raffle" && tool.raffle && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Números
            </h2>
            <Link
              href={`/panel/school/${id}/raffle-orders`}
              className="text-sm font-medium text-brand-darker hover:underline"
            >
              Confirmar compras
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted">
            Estado actual de los números (vista previa). Los compradores los eligen
            desde la página pública; confirmá cada pago en “Rifas”.
          </p>
          <div className="mt-4">
            <RaffleNumberGrid
              count={tool.raffle.numberCount}
              states={raffleNumberStates(orders, tool.raffle.numberCount)}
            />
            <RaffleNumberLegend />
          </div>
        </section>
      )}

      {/* Risk zone: deleting a tool is irreversible. */}
      <section className="mt-12 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Eliminar herramienta
        </h2>
        <p className="mt-1 text-sm text-muted">
          Se quita de la página de la escuela y no se puede deshacer.
        </p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="btn btn-destructive mt-3"
        >
          Eliminar herramienta
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar herramienta"
        tone="destructive"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        busy={deleting}
        busyLabel="Eliminando…"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          Vas a eliminar «{tool.title}». No se puede deshacer.
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

      {/* Remove a product — confirmed, with concrete impact (its media count). */}
      <ConfirmDialog
        open={saleRemoveId !== null}
        title="Quitar producto"
        tone="destructive"
        confirmLabel="Quitar producto"
        cancelLabel="Cancelar"
        busy={saleRemoving}
        busyLabel="Quitando…"
        onConfirm={() => {
          if (saleRemoveId !== null) removeSaleProduct(saleRemoveId);
        }}
        onCancel={() => setSaleRemoveId(null)}
      >
        {saleRemoveTarget && (
          <p>
            Vas a quitar «{saleRemoveTarget.name.trim() || "Producto sin nombre"}».
            Tiene {saleRemoveTarget.photos?.length ?? 0}{" "}
            {(saleRemoveTarget.photos?.length ?? 0) === 1 ? "foto" : "fotos"}
            {saleRemoveTarget.videoUrl ? " y un video" : ""}. No se puede deshacer.
          </p>
        )}
      </ConfirmDialog>

      {/* Remove a service — confirmed, with concrete impact (its media count). */}
      <ConfirmDialog
        open={serviceRemoveId !== null}
        title="Quitar servicio"
        tone="destructive"
        confirmLabel="Quitar servicio"
        cancelLabel="Cancelar"
        busy={serviceRemoving}
        busyLabel="Quitando…"
        onConfirm={() => {
          if (serviceRemoveId !== null) removeServiceItem(serviceRemoveId);
        }}
        onCancel={() => setServiceRemoveId(null)}
      >
        {serviceRemoveTarget && (
          <p>
            Vas a quitar «
            {serviceRemoveTarget.name.trim() || "Servicio sin nombre"}». Tiene{" "}
            {serviceRemoveTarget.photos?.length ?? 0}{" "}
            {(serviceRemoveTarget.photos?.length ?? 0) === 1 ? "foto" : "fotos"}
            {serviceRemoveTarget.videoUrl ? " y un video" : ""}. No se puede
            deshacer.
          </p>
        )}
      </ConfirmDialog>

      <p className="mt-8 text-sm">
        <BackLink href={`/panel/school/${id}/tools`}>
          Volver a herramientas
        </BackLink>
      </p>
    </main>
  );
}

/**
 * One guided-tour stage on the edit page: the shared text fields plus immediate photo/video
 * uploads. Media is keyed to the persisted `tour.stages` array, so an unsaved (not-yet-persisted)
 * stage disables uploads and shows a hint until it's saved — mirrors the project editor's
 * StageCard. Each upload validates type/size (and a video's duration ≤ 1 min) before sending.
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
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const photos = stage.photos ?? [];

  // Wrap a media op so upload/save failures report inline and the card's busy gate prevents a
  // double-fire.
  const run = async (op: () => Promise<void>, fallback: string) => {
    setMediaError(null);
    setBusy(true);
    try {
      await op();
    } catch (err) {
      setMediaError(userErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = (file: File) =>
    run(async () => {
      const url = await uploadToolStageAsset(schoolId, toolId, "photo", file);
      await onMedia({ photos: [...photos, url] });
    }, "No se pudo subir la foto.");

  const removePhoto = (url: string) =>
    run(
      () => onMedia({ photos: photos.filter((p) => p !== url) }),
      "No se pudo quitar la foto.",
    );

  const setVideo = (file: File) =>
    run(async () => {
      const url = await uploadToolStageAsset(schoolId, toolId, "video", file);
      await onMedia({ videoUrl: url });
    }, "No se pudo subir el video.");

  const removeVideo = () =>
    run(() => onMedia({ videoUrl: null }), "No se pudo quitar el video.");

  return (
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
            placeholder="Contá qué se ve y se hace en esta etapa."
          />
        </Field>

        {/* Photos */}
        <div>
          <p className="text-xs font-medium">
            Fotos ({photos.length}/{TOUR_STAGE_PHOTO_MAX})
          </p>
          {photos.length > 0 && (
            <ul className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((url, pi) => (
                <li key={url} className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface ring-1 ring-black/5">
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${pi + 1}`}
                    disabled={busy}
                    onClick={() => removePhoto(url)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < TOUR_STAGE_PHOTO_MAX &&
            (persisted ? (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    // This upload persists immediately, so its change event must NOT bubble to
                    // the form's onChange dirty-tracker (that would falsely warn "unsaved
                    // changes" though nothing is). Text fields still mark dirty as before.
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateImageFile(f);
                    if (v) return setMediaError(v);
                    addPhoto(f);
                  }}
                />
              </label>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Guardá la etapa para poder subir fotos y un video.
              </p>
            ))}
        </div>

        {/* Video (at most one per stage). Only shown for a saved stage or when one already
            exists; the photos hint above covers the unsaved case. */}
        {(persisted || stage.videoUrl) && (
          <div>
            <p className="text-xs font-medium">Video (máx. 1 min)</p>
            {stage.videoUrl ? (
              <div className="mt-1 flex flex-col gap-1">
                <video
                  controls
                  preload="metadata"
                  className="w-full rounded-lg bg-black ring-1 ring-black/5"
                >
                  <source src={stage.videoUrl} />
                </video>
                <button
                  type="button"
                  disabled={busy}
                  onClick={removeVideo}
                  className="inline-flex min-h-10 items-center justify-center gap-1 self-start rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                  Quitar video
                </button>
              </div>
            ) : (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar video"}
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={async (e) => {
                    // Persists immediately — don't let it bubble to the form's dirty-tracker
                    // (see the photo input above).
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateVideoFile(f, TOOL_VIDEO_MAX_MB);
                    if (v) return setMediaError(v);
                    let duration: number;
                    try {
                      duration = await videoDurationSeconds(f);
                    } catch {
                      setMediaError(
                        "No pudimos leer el video. Probá con otro archivo.",
                      );
                      return;
                    }
                    if (duration > TOOL_VIDEO_MAX_SECONDS + 2) {
                      setMediaError(
                        `El video debe durar máximo ${TOOL_VIDEO_MAX_SECONDS} segundos.`,
                      );
                      return;
                    }
                    setVideo(f);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {mediaError && (
          <p role="alert" className="text-xs text-error">
            {mediaError}
          </p>
        )}
      </div>
    </fieldset>
  );
}

/**
 * One sale product on the edit page: name/description/price text plus immediate photo/video
 * uploads. Media is keyed to the persisted `sale.products` array (by the product's stable id),
 * so an unsaved product disables uploads and shows a hint until it's saved. Mirrors
 * TourStageCard; the price is a string here (smooth decimal typing) and parsed on save.
 */
function SaleProductCard({
  product,
  index,
  currency,
  schoolId,
  toolId,
  canRemove,
  persisted,
  onText,
  onMedia,
  onRemove,
}: {
  product: EditableSaleProduct;
  index: number;
  currency: ProjectCurrency;
  schoolId: string;
  toolId: string;
  canRemove: boolean;
  /** Whether this product is saved in Firestore; unsaved products can't receive media. */
  persisted: boolean;
  onText: (
    patch: Partial<Pick<EditableSaleProduct, "name" | "description" | "price">>,
  ) => void;
  onMedia: (media: {
    photos?: string[];
    videoUrl?: string | null;
  }) => Promise<void>;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const photos = product.photos ?? [];

  const run = async (op: () => Promise<void>, fallback: string) => {
    setMediaError(null);
    setBusy(true);
    try {
      await op();
    } catch (err) {
      setMediaError(userErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = (file: File) =>
    run(async () => {
      const url = await uploadToolStageAsset(schoolId, toolId, "photo", file);
      await onMedia({ photos: [...photos, url] });
    }, "No se pudo subir la foto.");

  const removePhoto = (url: string) =>
    run(
      () => onMedia({ photos: photos.filter((p) => p !== url) }),
      "No se pudo quitar la foto.",
    );

  const setVideo = (file: File) =>
    run(async () => {
      const url = await uploadToolStageAsset(schoolId, toolId, "video", file);
      await onMedia({ videoUrl: url });
    }, "No se pudo subir el video.");

  const removeVideo = () =>
    run(() => onMedia({ videoUrl: null }), "No se pudo quitar el video.");

  return (
    <fieldset className={`${cardClass("elevated", false)} p-4`}>
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold tracking-tight text-foreground">
          Producto {index + 1}
        </legend>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
          >
            Quitar producto
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <Field label="Nombre del producto">
          <input
            type="text"
            maxLength={SALE_PRODUCT_NAME_MAX}
            value={product.name}
            onChange={(e) => onText({ name: e.target.value })}
            className="input"
            placeholder="Ej.: Huevos de la granja de la escuela"
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={3}
            maxLength={SALE_PRODUCT_DESCRIPTION_MAX}
            value={product.description}
            onChange={(e) => onText({ description: e.target.value })}
            className="input"
            placeholder="Contá qué es, presentación, etc."
          />
        </Field>
        <Field label={`Precio (${currency})`}>
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={product.price}
            onChange={(e) => onText({ price: e.target.value })}
            className="input"
            placeholder="Ej.: 2500"
          />
        </Field>

        {/* Photos */}
        <div>
          <p className="text-xs font-medium">
            Fotos ({photos.length}/{SALE_PRODUCT_PHOTO_MAX})
          </p>
          {photos.length > 0 && (
            <ul className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((url, pi) => (
                <li key={url} className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface ring-1 ring-black/5">
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${pi + 1}`}
                    disabled={busy}
                    onClick={() => removePhoto(url)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < SALE_PRODUCT_PHOTO_MAX &&
            (persisted ? (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    // Persists immediately — don't let it bubble to the form's dirty-tracker.
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateImageFile(f);
                    if (v) return setMediaError(v);
                    addPhoto(f);
                  }}
                />
              </label>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Guardá el producto para poder subir fotos y un video.
              </p>
            ))}
        </div>

        {/* Video (at most one per product). Only shown for a saved product or when one already
            exists; the photos hint above covers the unsaved case. */}
        {(persisted || product.videoUrl) && (
          <div>
            <p className="text-xs font-medium">Video (máx. 1 min)</p>
            {product.videoUrl ? (
              <div className="mt-1 flex flex-col gap-1">
                <video
                  controls
                  preload="metadata"
                  className="w-full rounded-lg bg-black ring-1 ring-black/5"
                >
                  <source src={product.videoUrl} />
                </video>
                <button
                  type="button"
                  disabled={busy}
                  onClick={removeVideo}
                  className="inline-flex min-h-10 items-center justify-center gap-1 self-start rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                  Quitar video
                </button>
              </div>
            ) : (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar video"}
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={async (e) => {
                    // Persists immediately — don't let it bubble to the form's dirty-tracker.
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateVideoFile(f, TOOL_VIDEO_MAX_MB);
                    if (v) return setMediaError(v);
                    let duration: number;
                    try {
                      duration = await videoDurationSeconds(f);
                    } catch {
                      setMediaError(
                        "No pudimos leer el video. Probá con otro archivo.",
                      );
                      return;
                    }
                    if (duration > TOOL_VIDEO_MAX_SECONDS + 2) {
                      setMediaError(
                        `El video debe durar máximo ${TOOL_VIDEO_MAX_SECONDS} segundos.`,
                      );
                      return;
                    }
                    setVideo(f);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {mediaError && (
          <p role="alert" className="text-xs text-error">
            {mediaError}
          </p>
        )}
      </div>
    </fieldset>
  );
}

/**
 * One service on the edit page: name/description/optional-price text plus immediate photo/video
 * uploads. Mirrors SaleProductCard (a service is a product without the order flow); the price is
 * optional here ("a consultar" when blank). Media is keyed to the persisted `service.services`
 * array by the service's stable id, so an unsaved service disables uploads until it's saved.
 */
function ServiceItemCard({
  service,
  index,
  currency,
  schoolId,
  toolId,
  canRemove,
  persisted,
  onText,
  onMedia,
  onRemove,
}: {
  service: EditableServiceItem;
  index: number;
  currency: ProjectCurrency;
  schoolId: string;
  toolId: string;
  canRemove: boolean;
  /** Whether this service is saved in Firestore; unsaved services can't receive media. */
  persisted: boolean;
  onText: (
    patch: Partial<Pick<EditableServiceItem, "name" | "description" | "price">>,
  ) => void;
  onMedia: (media: {
    photos?: string[];
    videoUrl?: string | null;
  }) => Promise<void>;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const photos = service.photos ?? [];

  const run = async (op: () => Promise<void>, fallback: string) => {
    setMediaError(null);
    setBusy(true);
    try {
      await op();
    } catch (err) {
      setMediaError(userErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = (file: File) =>
    run(async () => {
      const url = await uploadToolStageAsset(schoolId, toolId, "photo", file);
      await onMedia({ photos: [...photos, url] });
    }, "No se pudo subir la foto.");

  const removePhoto = (url: string) =>
    run(
      () => onMedia({ photos: photos.filter((p) => p !== url) }),
      "No se pudo quitar la foto.",
    );

  const setVideo = (file: File) =>
    run(async () => {
      const url = await uploadToolStageAsset(schoolId, toolId, "video", file);
      await onMedia({ videoUrl: url });
    }, "No se pudo subir el video.");

  const removeVideo = () =>
    run(() => onMedia({ videoUrl: null }), "No se pudo quitar el video.");

  return (
    <fieldset className={`${cardClass("elevated", false)} p-4`}>
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold tracking-tight text-foreground">
          Servicio {index + 1}
        </legend>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
          >
            Quitar servicio
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <Field label="Nombre del servicio">
          <input
            type="text"
            maxLength={SERVICE_NAME_MAX}
            value={service.name}
            onChange={(e) => onText({ name: e.target.value })}
            className="input"
            placeholder="Ej.: Clases de repaso de matemática"
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={3}
            maxLength={SERVICE_DESCRIPTION_MAX}
            value={service.description}
            onChange={(e) => onText({ description: e.target.value })}
            className="input"
            placeholder="Contá en qué consiste el servicio."
          />
        </Field>
        <Field label={`Precio (${currency}) — opcional`}>
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={service.price}
            onChange={(e) => onText({ price: e.target.value })}
            className="input"
            placeholder="Dejalo en blanco si es a consultar"
          />
        </Field>

        {/* Photos */}
        <div>
          <p className="text-xs font-medium">
            Fotos ({photos.length}/{SERVICE_PHOTO_MAX})
          </p>
          {photos.length > 0 && (
            <ul className="mt-1 grid grid-cols-4 gap-2">
              {photos.map((url, pi) => (
                <li key={url} className="flex flex-col gap-1">
                  <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface ring-1 ring-black/5">
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar foto ${pi + 1}`}
                    disabled={busy}
                    onClick={() => removePhoto(url)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < SERVICE_PHOTO_MAX &&
            (persisted ? (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    // Persists immediately — don't let it bubble to the form's dirty-tracker.
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateImageFile(f);
                    if (v) return setMediaError(v);
                    addPhoto(f);
                  }}
                />
              </label>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Guardá el servicio para poder subir fotos y un video.
              </p>
            ))}
        </div>

        {/* Video (at most one per service). */}
        {(persisted || service.videoUrl) && (
          <div>
            <p className="text-xs font-medium">Video (máx. 1 min)</p>
            {service.videoUrl ? (
              <div className="mt-1 flex flex-col gap-1">
                <video
                  controls
                  preload="metadata"
                  className="w-full rounded-lg bg-black ring-1 ring-black/5"
                >
                  <source src={service.videoUrl} />
                </video>
                <button
                  type="button"
                  disabled={busy}
                  onClick={removeVideo}
                  className="inline-flex min-h-10 items-center justify-center gap-1 self-start rounded-lg bg-surface px-2 text-xs font-medium text-muted ring-1 ring-black/5 transition-colors hover:text-error hover:ring-error/20"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                  Quitar video
                </button>
              </div>
            ) : (
              <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-surface px-3 text-xs font-medium text-brand-darker ring-1 ring-black/5 transition-colors hover:ring-brand-darker/30 focus-within:ring-2 focus-within:ring-brand">
                {busy ? "Subiendo…" : "Agregar video"}
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  disabled={busy}
                  onChange={async (e) => {
                    // Persists immediately — don't let it bubble to the form's dirty-tracker.
                    e.stopPropagation();
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const v = validateVideoFile(f, TOOL_VIDEO_MAX_MB);
                    if (v) return setMediaError(v);
                    let duration: number;
                    try {
                      duration = await videoDurationSeconds(f);
                    } catch {
                      setMediaError(
                        "No pudimos leer el video. Probá con otro archivo.",
                      );
                      return;
                    }
                    if (duration > TOOL_VIDEO_MAX_SECONDS + 2) {
                      setMediaError(
                        `El video debe durar máximo ${TOOL_VIDEO_MAX_SECONDS} segundos.`,
                      );
                      return;
                    }
                    setVideo(f);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {mediaError && (
          <p role="alert" className="text-xs text-error">
            {mediaError}
          </p>
        )}
      </div>
    </fieldset>
  );
}
