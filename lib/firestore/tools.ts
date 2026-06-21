/**
 * Typed reads AND writes of school "Herramientas" (`schools/{schoolId}/tools/{toolId}`).
 * Public read, so reads run from server components (the public "Principal" section + the tool
 * detail page); writes (the board's tool CRUD) run client-side from the panel.
 *
 * A tool is a lightweight activity a school runs that doesn't warrant its own tab — a raffle,
 * a bingo, a sale, a service, a guided tour. The concrete kinds live in a registry
 * (lib/tools/registry); the storage shape here is the same for every kind. PURELY
 * INFORMATIONAL: like every other surface the platform never touches money — a tool may carry
 * an optional call-to-action LINK (scheme-checked on write), nothing more. No
 * function-maintained fields: the school owns every field (so, unlike projects, there are no
 * counters to preserve).
 */
import { cache } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { formatDate } from "@/lib/format";
import { safeExternalUrl } from "@/lib/url";
import type {
  BingoConfig,
  BingoFormat,
  BingoPrizes,
  BingoWinningPattern,
  EventConfig,
  ProjectCurrency,
  RaffleConfig,
  SaleConfig,
  ServiceConfig,
  ServiceModality,
  Tool,
  ToolCta,
  ToolDoc,
  ToolStatus,
  ToolType,
  TourConfig,
} from "@/types";
import { BINGO_PATTERNS, RAFFLE_NUMBER_COUNT } from "@/types";
import { docToTyped, snapToList } from "./converters";

const SCHOOLS = "schools";
const TOOLS = "tools";

/** Subcollection ref for a school's tools. */
function toolsCol(schoolId: string) {
  return collection(db, SCHOOLS, schoolId, TOOLS);
}

/** Sort by createdAt (desc) in JS to avoid a composite index (matches projects). */
function byCreatedAtDesc(
  a: { createdAt?: { toMillis?: () => number } },
  b: { createdAt?: { toMillis?: () => number } },
): number {
  return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
}

/**
 * All tools of a school (any status), newest first.
 *
 * Wrapped in React cache(): the public school "Principal" section and (when present) other
 * server reads in the same request share a single Firestore read.
 */
export const getToolsBySchool = cache(
  async (schoolId: string): Promise<ToolDoc[]> => {
    const snap = await getDocs(toolsCol(schoolId));
    return snapToList<Tool>(snap).sort(byCreatedAtDesc);
  },
);

/**
 * A single tool by ids. Returns null if it does not exist.
 *
 * Wrapped in React cache(): the detail page's generateMetadata and the page component read
 * the same tool during one request — the cache dedupes that into a single Firestore read.
 */
export const getToolById = cache(
  async (schoolId: string, toolId: string): Promise<ToolDoc | null> => {
    return docToTyped<Tool>(await getDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId)));
  },
);

/** The tools a school shows publicly (status 'active'), newest first. */
export function publicTools(tools: ToolDoc[]): ToolDoc[] {
  return tools.filter((t) => t.status === "active");
}

/**
 * Human label for a tool's optional activity window: "15 jun 2026 – 20 jun 2026",
 * "Desde 15 jun 2026", "Hasta 20 jun 2026", or null when no dates are set.
 */
export function toolWindowLabel(
  tool: Pick<Tool, "startsAt" | "endsAt">,
): string | null {
  const s = tool.startsAt?.toMillis?.();
  const e = tool.endsAt?.toMillis?.();
  if (s && e) return `${formatDate(s)} – ${formatDate(e)}`;
  if (s) return `Desde ${formatDate(s)}`;
  if (e) return `Hasta ${formatDate(e)}`;
  return null;
}

/**
 * The tool's own WhatsApp contact, across the kinds that carry one (tour/sale/service/bingo/
 * event). A raffle has none. Empty string when the tool sets no contact — callers fall back to
 * the school's board phone. Used by the feed card's "Consultar" action.
 */
export function toolContactPhone(tool: ToolDoc): string {
  return (
    tool.tour?.contactPhone ||
    tool.sale?.contactPhone ||
    tool.service?.contactPhone ||
    tool.bingo?.contactPhone ||
    tool.event?.contactPhone ||
    ""
  );
}

// ── Date <-> <input type="date"> helpers (day-granular, UTC) ─────────────────
// A tool date is a calendar DAY, not an instant — it must read back as the same day for
// every viewer. So the round-trip is anchored at UTC midnight (store) and read with UTC
// getters (display), and toolWindowLabel formats in UTC too. Using LOCAL midnight would
// shift the stored day by the writer's offset and render a day off for readers east of UTC.

/** Firestore Timestamp → "YYYY-MM-DD" (UTC) for an `<input type="date">` value. */
export function toolDateInputValue(ts: Timestamp | undefined): string {
  if (!ts) return "";
  const d = ts.toDate();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/** "YYYY-MM-DD" → a UTC-midnight Date, or null when empty/invalid. */
export function toolDateFromInput(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * A Timestamp → "YYYY-MM-DDTHH:mm" for an <input type="datetime-local">, in LOCAL time (the input
 * is timezone-naive and the school + its community share a timezone). "" when absent. Counterpart
 * to toolDateInputValue, for the event date+time.
 */
export function toolDateTimeInputValue(ts?: {
  toDate: () => Date;
}): string {
  if (!ts) return "";
  const d = ts.toDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (datetime-local, local time) → a Date, or null when empty/invalid. */
export function toolDateTimeFromInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value); // local time, as the datetime-local input provides
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Writes (board tool CRUD) ─────────────────────────────────────────────────

/**
 * Drop a CTA that isn't both labelled AND a safe http(s) URL. The scheme check (parse, not
 * regex) is what makes the stored link safe to render in an `<a href>` later — a
 * `javascript:`/`data:` value is rejected here (defense in depth with the render-side guard).
 */
function sanitizeCta(
  cta: { label: string; url: string } | null | undefined,
): ToolCta | null {
  if (!cta) return null;
  const label = cta.label.trim();
  const url = safeExternalUrl(cta.url);
  if (!label || !url) return null;
  return { label, url };
}

/** Form-shaped raffle config (dates as Date, prizes pre-trimmed) — see buildRaffleConfig. */
export interface RaffleConfigInput {
  drawDate: Date | null;
  pricePerNumber: number;
  currency: ProjectCurrency;
  /** 1–3 prizes, first required; callers trim and drop empties. */
  prizes: string[];
  drawMethod: string;
}

/** Build the stored RaffleConfig from form input (numberCount is fixed for now). */
function buildRaffleConfig(input: RaffleConfigInput): RaffleConfig {
  return {
    numberCount: RAFFLE_NUMBER_COUNT,
    pricePerNumber: input.pricePerNumber,
    currency: input.currency,
    prizes: input.prizes,
    drawMethod: input.drawMethod,
    ...(input.drawDate ? { drawDate: Timestamp.fromDate(input.drawDate) } : {}),
  };
}

/** One stage of a guided tour, form-shaped. Media URLs (photos/videoUrl) are already
 * uploaded to Storage by the time they reach here (the edit page persists them per stage). */
export interface TourStageInput {
  title: string;
  description: string;
  photos?: string[];
  videoUrl?: string;
}

/** Form-shaped guided-tour config — see buildTourConfig. */
export interface TourConfigInput {
  stages: TourStageInput[];
  /** Optional WhatsApp number (free text); empty falls back to the school's board phone. */
  contactPhone?: string;
}

/**
 * Build the stored TourConfig from form input. Drops empty optional fields (Firestore rejects
 * `undefined`): a stage with no media omits `photos`/`videoUrl`, and an empty contact phone is
 * omitted. Readers default `photos` to [] and treat a missing `videoUrl` as no video.
 */
function buildTourConfig(input: TourConfigInput): TourConfig {
  return {
    stages: input.stages.map((s) => ({
      title: s.title,
      description: s.description,
      ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
      ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
    })),
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
  };
}

/** One product, form-shaped. Media URLs (photos/videoUrl) are already uploaded to Storage by
 * the time they reach here (the edit page persists them per product). `id` is stable. */
export interface SaleProductInput {
  id: string;
  name: string;
  description: string;
  photos?: string[];
  videoUrl?: string;
  price: number;
}

/** Form-shaped product-catalog config — see buildSaleConfig. */
export interface SaleConfigInput {
  products: SaleProductInput[];
  currency: ProjectCurrency;
  /** Optional WhatsApp number (free text); empty falls back to the school's board phone. */
  contactPhone?: string;
}

/**
 * Build the stored SaleConfig from form input. Drops empty optional fields (Firestore rejects
 * `undefined`): a product with no media omits `photos`/`videoUrl`, and an empty contact phone is
 * omitted. Readers default `photos` to [] and treat a missing `videoUrl` as no video.
 */
function buildSaleConfig(input: SaleConfigInput): SaleConfig {
  return {
    products: input.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      ...(p.photos && p.photos.length > 0 ? { photos: p.photos } : {}),
      ...(p.videoUrl ? { videoUrl: p.videoUrl } : {}),
    })),
    currency: input.currency,
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
  };
}

/** One service, form-shaped. Media URLs are already uploaded by the time they reach here (the
 * edit page persists them per service). `id` is stable; `price` is optional (quote-based). */
export interface ServiceItemInput {
  id: string;
  name: string;
  description: string;
  photos?: string[];
  videoUrl?: string;
  price?: number;
  /** Marks `price` as a starting point ("Desde ₡X"); meaningful only when a price is set. */
  priceFrom?: boolean;
  modalities?: ServiceModality[];
  availability?: string;
}

/** Form-shaped service-catalog config — see buildServiceConfig. */
export interface ServiceConfigInput {
  services: ServiceItemInput[];
  currency: ProjectCurrency;
  contactPhone?: string;
}

/**
 * Build the stored ServiceConfig from form input. Drops empty optional fields (Firestore rejects
 * `undefined`): a service with no media omits `photos`/`videoUrl`, a quote-based service omits
 * `price` (and `priceFrom`, which is meaningless without one), an empty modality set or blank
 * availability is omitted, and an empty contact phone is omitted.
 */
function buildServiceConfig(input: ServiceConfigInput): ServiceConfig {
  return {
    services: input.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      ...(typeof s.price === "number" ? { price: s.price } : {}),
      ...(typeof s.price === "number" && s.priceFrom ? { priceFrom: true } : {}),
      ...(s.modalities && s.modalities.length > 0
        ? { modalities: s.modalities }
        : {}),
      ...(s.availability ? { availability: s.availability } : {}),
      ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
      ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
    })),
    currency: input.currency,
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
  };
}

/** Form-shaped bingo config — dates as Date, the rest already trimmed/parsed. The cartones
 * (lote) are NOT here; they live in a subcollection managed by lib/firestore/bingo-cards. */
export interface BingoConfigInput {
  format: BingoFormat;
  /** Prizes the school offers (premio mayor + optional 2nd/3rd + extras), already trimmed. */
  prizes: BingoPrizes;
  /** Enabled winning patterns (≥1), each with its prize. Optional: the board no longer sets
   * these, so when omitted buildBingoConfig defaults to all shapes for the live event. */
  patterns?: BingoWinningPattern[];
  pricePerCard: number;
  currency: ProjectCurrency;
  eventDate?: Date | null;
  drawMethod?: string;
  contactPhone?: string;
  /** Easy mode: the play grid only lets players tap called numbers. Default (false/omitted) is
   * traditional — players mark by hand and may err. See BingoConfig.assistMarking. */
  assistMarking?: boolean;
}

/** All winning shapes enabled, prize-less — the default the board gets now that prizes are no
 * longer tied to a shape. The live event still reads these; the director will narrow them per
 * round (deferred). */
const DEFAULT_BINGO_PATTERNS: BingoWinningPattern[] = BINGO_PATTERNS.map(
  (pattern) => ({ pattern, prize: "" }),
);

/**
 * Build the stored BingoConfig from form input. Drops empty optional fields (Firestore rejects
 * `undefined`): no second/third prize, event date, draw method or contact phone is omitted.
 */
function buildBingoConfig(input: BingoConfigInput): BingoConfig {
  const { first, second, third, others } = input.prizes;
  return {
    format: {
      rows: input.format.rows,
      cols: input.format.cols,
      poolMin: input.format.poolMin,
      poolMax: input.format.poolMax,
    },
    prizes: {
      first,
      ...(second ? { second } : {}),
      ...(third ? { third } : {}),
      others,
    },
    patterns: (input.patterns ?? DEFAULT_BINGO_PATTERNS).map((p) => ({
      pattern: p.pattern,
      prize: p.prize,
    })),
    pricePerCard: input.pricePerCard,
    currency: input.currency,
    ...(input.eventDate ? { eventDate: Timestamp.fromDate(input.eventDate) } : {}),
    ...(input.drawMethod ? { drawMethod: input.drawMethod } : {}),
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
    // Only persist easy mode when enabled; absent reads as traditional (the default).
    ...(input.assistMarking ? { assistMarking: true } : {}),
  };
}

/** Form-shaped event config — date as a Date, the gallery URLs already uploaded to Storage. */
export interface EventConfigInput {
  date: Date | null;
  place?: string;
  /** Map link; scheme-checked here (a non-http(s) value is dropped). */
  mapUrl?: string;
  photos?: string[];
  videoUrl?: string;
  contactPhone?: string;
}

/**
 * Build the stored EventConfig from form input. Drops empty optional fields (Firestore rejects
 * `undefined`): no date / place / map link / media / contact phone is omitted. The map link is
 * scheme-checked (safeExternalUrl) so a `javascript:`/`data:` value never reaches an `<a href>`.
 */
function buildEventConfig(input: EventConfigInput): EventConfig {
  const mapUrl = input.mapUrl ? safeExternalUrl(input.mapUrl) : null;
  return {
    ...(input.date ? { date: Timestamp.fromDate(input.date) } : {}),
    ...(input.place ? { place: input.place } : {}),
    ...(mapUrl ? { mapUrl } : {}),
    ...(input.photos && input.photos.length > 0 ? { photos: input.photos } : {}),
    ...(input.videoUrl ? { videoUrl: input.videoUrl } : {}),
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
  };
}

export interface CreateToolInput {
  type: ToolType;
  title: string;
  description: string;
  /** Defaults to 'active' (visible). */
  status?: ToolStatus;
  /** Raffle configuration — pass only when type === 'raffle'. */
  raffle?: RaffleConfigInput;
  /** Guided-tour configuration — pass only when type === 'guided_tour'. */
  tour?: TourConfigInput;
  /** Product-catalog configuration — pass only when type === 'sale'. */
  sale?: SaleConfigInput;
  /** Service-catalog configuration — pass only when type === 'service'. */
  service?: ServiceConfigInput;
  /** Bingo configuration — pass only when type === 'bingo'. */
  bingo?: BingoConfigInput;
  /** Event configuration — pass only when type === 'event'. */
  event?: EventConfigInput;
}

/**
 * Pre-allocate a tool's id WITHOUT writing the doc. The creation page needs the id up front so
 * its per-item media (a product/service/stage photo or video) can upload to the tool's Storage
 * path — `schools/{schoolId}/tools/{toolId}/…`, gated only by school ownership, NOT by the doc
 * existing — while the board is still filling the form. The collected URLs then ride along in
 * the single `createTool` write (pass this id as its `toolId`). Pure ref construction; no I/O.
 */
export function newToolId(schoolId: string): string {
  return doc(toolsCol(schoolId)).id;
}

/**
 * Create a tool, forced 'active' by default. Every kind's own config — including any per-item
 * media (photos/video) already uploaded to Storage — is written here in one go, then the board
 * returns to the hub (mirrors the rifa flow for every kind). Pass a pre-allocated `toolId`
 * (newToolId) when media was uploaded to that path during the form; otherwise an id is minted.
 * The COVER is NOT written here — `validToolCreate` (firestore.rules) pins the create field set
 * and excludes `coverUrl`, so the cover is added by a follow-up `setToolCover` update. Returns
 * the tool id.
 */
export async function createTool(
  schoolId: string,
  schoolName: string,
  ownerId: string,
  input: CreateToolInput,
  toolId?: string,
): Promise<string> {
  const data = {
    schoolId,
    schoolName,
    type: input.type,
    title: input.title,
    description: input.description,
    status: input.status ?? "active",
    ...(input.raffle ? { raffle: buildRaffleConfig(input.raffle) } : {}),
    ...(input.tour ? { tour: buildTourConfig(input.tour) } : {}),
    ...(input.sale ? { sale: buildSaleConfig(input.sale) } : {}),
    ...(input.service ? { service: buildServiceConfig(input.service) } : {}),
    ...(input.bingo ? { bingo: buildBingoConfig(input.bingo) } : {}),
    ...(input.event ? { event: buildEventConfig(input.event) } : {}),
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  // A pre-allocated id is written with setDoc (the board already uploaded media under its path);
  // without one, addDoc mints the id. Both hit the same `create` rule.
  if (toolId) {
    await setDoc(doc(toolsCol(schoolId), toolId), data);
    return toolId;
  }
  return (await addDoc(toolsCol(schoolId), data)).id;
}

export interface ToolPatch {
  type: ToolType;
  title: string;
  description: string;
  status: ToolStatus;
  /** A NEW cover URL to set; omit to keep the existing cover. */
  coverUrl?: string;
  /** Activity window — null clears the field. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** Call to action — null (or an unsafe/empty value) clears the field. */
  cta: { label: string; url: string } | null;
  /** Raffle config — pass only when type === 'raffle'; omit to leave it untouched. */
  raffle?: RaffleConfigInput;
  /** Guided-tour config — pass only when type === 'guided_tour'; omit to leave it untouched. */
  tour?: TourConfigInput;
  /** Product-catalog config — pass only when type === 'sale'; omit to leave it untouched. */
  sale?: SaleConfigInput;
  /** Service-catalog config — pass only when type === 'service'; omit to leave it untouched. */
  service?: ServiceConfigInput;
  /** Bingo config — pass only when type === 'bingo'; omit to leave it untouched. */
  bingo?: BingoConfigInput;
  /** Event config — pass only when type === 'event'; omit to leave it untouched. */
  event?: EventConfigInput;
}

/**
 * Update a tool. Optional fields are set when present and DELETED when null (deleteField), so
 * clearing a date or the CTA in the form actually removes it from the doc. updatedAt is
 * always refreshed.
 */
export async function updateTool(
  schoolId: string,
  toolId: string,
  patch: ToolPatch,
): Promise<void> {
  const cta = sanitizeCta(patch.cta);
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    type: patch.type,
    title: patch.title,
    description: patch.description,
    status: patch.status,
    ...(patch.coverUrl ? { coverUrl: patch.coverUrl } : {}),
    // Keep type and its config in sync: only the matching kind's config may live on the doc.
    // Switching kinds must drop the stale config so it can't silently reappear; the matching
    // kind writes its config when provided and deletes the other two. Deleting a field that was
    // never there is a no-op (and not a "changed key" for the rules).
    ...(patch.type === "raffle"
      ? {
          ...(patch.raffle ? { raffle: buildRaffleConfig(patch.raffle) } : {}),
          tour: deleteField(),
          sale: deleteField(),
          service: deleteField(),
          bingo: deleteField(),
          event: deleteField(),
        }
      : patch.type === "guided_tour"
        ? {
            ...(patch.tour ? { tour: buildTourConfig(patch.tour) } : {}),
            raffle: deleteField(),
            sale: deleteField(),
            service: deleteField(),
            bingo: deleteField(),
            event: deleteField(),
          }
        : patch.type === "sale"
          ? {
              ...(patch.sale ? { sale: buildSaleConfig(patch.sale) } : {}),
              raffle: deleteField(),
              tour: deleteField(),
              service: deleteField(),
              bingo: deleteField(),
              event: deleteField(),
            }
          : patch.type === "service"
            ? {
                ...(patch.service
                  ? { service: buildServiceConfig(patch.service) }
                  : {}),
                raffle: deleteField(),
                tour: deleteField(),
                sale: deleteField(),
                bingo: deleteField(),
                event: deleteField(),
              }
            : patch.type === "bingo"
              ? {
                  ...(patch.bingo
                    ? { bingo: buildBingoConfig(patch.bingo) }
                    : {}),
                  raffle: deleteField(),
                  tour: deleteField(),
                  sale: deleteField(),
                  service: deleteField(),
                  event: deleteField(),
                }
              : patch.type === "event"
                ? {
                    ...(patch.event
                      ? { event: buildEventConfig(patch.event) }
                      : {}),
                    raffle: deleteField(),
                    tour: deleteField(),
                    sale: deleteField(),
                    service: deleteField(),
                    bingo: deleteField(),
                  }
                : {
                    raffle: deleteField(),
                    tour: deleteField(),
                    sale: deleteField(),
                    service: deleteField(),
                    bingo: deleteField(),
                    event: deleteField(),
                  }),
    startsAt: patch.startsAt ? Timestamp.fromDate(patch.startsAt) : deleteField(),
    endsAt: patch.endsAt ? Timestamp.fromDate(patch.endsAt) : deleteField(),
    cta: cta ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Persist ONLY the guided-tour config (stages + contact phone), leaving every other tool
 * field untouched. Used by the edit page to commit a per-stage media change (a photo/video
 * add or remove) immediately — the same reason the project editor persists stage media on its
 * own write: an in-progress, unsaved text edit elsewhere on the form must not be dragged along
 * by the upload. Touches only `tour` + `updatedAt`, which the tool update rule allows.
 */
export async function updateToolTour(
  schoolId: string,
  toolId: string,
  tour: TourConfigInput,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    tour: buildTourConfig(tour),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Persist ONLY the product-catalog config, leaving every other tool field untouched. Same
 * rationale as updateToolTour: the edit page uses it to commit a per-product media change (a
 * photo/video add or remove) immediately, without dragging along an in-progress, unsaved text
 * edit. Touches only `sale` + `updatedAt`, which the tool update rule allows.
 */
export async function updateToolSale(
  schoolId: string,
  toolId: string,
  sale: SaleConfigInput,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    sale: buildSaleConfig(sale),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Persist ONLY the service-catalog config, leaving every other tool field untouched. Same
 * rationale as updateToolSale/updateToolTour: the edit page uses it to commit a per-service
 * media change immediately, without dragging along an in-progress, unsaved text edit. Touches
 * only `service` + `updatedAt`, which the tool update rule allows.
 */
export async function updateToolService(
  schoolId: string,
  toolId: string,
  service: ServiceConfigInput,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    service: buildServiceConfig(service),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Persist ONLY the event config, leaving every other tool field untouched. Same rationale as
 * updateToolService: the edit page uses it to commit a gallery change (a photo/video add or
 * remove) immediately from the persisted base, without dragging along an in-progress, unsaved
 * text edit (date/place/map). Touches only `event` + `updatedAt`, which the tool update rule allows.
 */
export async function updateToolEvent(
  schoolId: string,
  toolId: string,
  event: EventConfigInput,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    event: buildEventConfig(event),
    updatedAt: serverTimestamp(),
  });
}

/** Toggle a tool's visibility (quick action from the list). */
export async function setToolStatus(
  schoolId: string,
  toolId: string,
  status: ToolStatus,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTool(
  schoolId: string,
  toolId: string,
): Promise<void> {
  await deleteDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId));
}

/**
 * Set just a tool's cover URL (after uploading the image with uploadToolCover). A minimal
 * write — unlike updateTool it touches only `coverUrl`, so it never disturbs the kind config.
 * Used by the creation page, where a raffle can add its cover without leaving for the edit page.
 */
export async function setToolCover(
  schoolId: string,
  toolId: string,
  coverUrl: string,
): Promise<void> {
  await updateDoc(doc(db, SCHOOLS, schoolId, TOOLS, toolId), {
    coverUrl,
    updatedAt: serverTimestamp(),
  });
}

/** Upload a tool cover image; returns its public download URL. Timestamped so it never
 * overwrites a previous cover. */
export async function uploadToolCover(
  schoolId: string,
  toolId: string,
  file: Blob,
): Promise<string> {
  const ref = storageRef(
    storage,
    `schools/${schoolId}/tools/${toolId}/cover-${Date.now()}`,
  );
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

/**
 * Upload a guided-tour stage asset (a photo or a video); returns its public download URL.
 * Lives in the same directory as the cover and is governed by the same Storage rule
 * (schools/{id}/tools/{toolId}/**). Timestamped so it never overwrites a previous file.
 */
export async function uploadToolStageAsset(
  schoolId: string,
  toolId: string,
  kind: "photo" | "video",
  file: Blob,
): Promise<string> {
  const ref = storageRef(
    storage,
    `schools/${schoolId}/tools/${toolId}/${kind}-${Date.now()}`,
  );
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}
