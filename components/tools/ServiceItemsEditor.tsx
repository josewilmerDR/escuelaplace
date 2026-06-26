"use client";

/**
 * The service inputs for the CREATE form (the seam the ToolTypePicker opens, like
 * SaleProductsEditor). A "Servicios" tool is, for now, a SINGLE service: its name and description
 * are the tool's own title/description (collected by the create page's top-level fields), so this
 * editor only adds what's specific to a service — the currency, the OPTIONAL price (blank =
 * quote-based), its delivery modality + availability, its media (photos + a short video) and the
 * optional WhatsApp number for the "Preguntar" button. Media uploads immediately to the tool's
 * Storage path (the create page pre-allocates the tool id so the path is valid before the doc
 * exists) and the URLs ride along in the single `createTool` write — so the whole service, media
 * included, is filled here and the board returns to the hub (mirrors the producto flow). There is
 * no order flow.
 *
 * The data model still stores `service.services` as an ARRAY (with one item here): that's where a
 * future catalog — a union of previously created services — would plug in, so the public page and
 * the "Preguntar" flow need no change. The service's stable `id` is minted when the form is
 * initialized (in a useState lazy initializer — never rendered to the DOM, so SSR-safe) and carried
 * through, so media attaches to the right service.
 *
 * Controlled: the parent owns a ServiceFormValue (value + onChange). Validation/conversion to the
 * data-layer ServiceConfigInput lives here too — `toServiceInput` takes the service's
 * name/description from the page (the top-level fields) and folds in this editor's
 * price/currency/modality/availability/media/contact.
 */
import type { Dispatch, SetStateAction } from "react";
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { Field } from "@/components/ui/Field";
import {
  PROJECT_CURRENCIES,
  SERVICE_AVAILABILITY_MAX,
  SERVICE_MODALITIES,
  SERVICE_MODALITY_LABELS,
  SERVICE_PHOTO_MAX,
  type ProjectCurrency,
  type ServiceModality,
} from "@/types";
import type { ServiceConfigInput } from "@/lib/firestore";

/** A stable id for a service, generated in an event handler / lazy initializer (SSR-safe). Shared
 * with the edit page, which mints the id for a freshly-typed service. */
export function newServiceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The create-form value for a single service: its stable id, the OPTIONAL price (string while
 * editing), the "desde" flag, the delivery modalities, the availability text, the currency, the
 * optional WhatsApp and the already-uploaded media URLs. The name and description live on the
 * create page's top-level fields, not here.
 */
export interface ServiceFormValue {
  /** Stable service id (minted on init); the media match key. */
  id: string;
  /** Price as the input holds it (string); optional (blank = quote-based). */
  price: string;
  /** Show the price as a starting point ("Desde ₡X"); only used when a price is set. */
  priceFrom: boolean;
  /** How the service is delivered (presencial / a domicilio / virtual). */
  modalities: ServiceModality[];
  /** Free-text schedule/availability. */
  availability: string;
  currency: ProjectCurrency;
  contactPhone: string;
  /** Photos already uploaded to Storage (URLs). */
  photos?: string[];
  /** A short video already uploaded to Storage (URL). */
  videoUrl?: string;
}

export function emptyServiceForm(): ServiceFormValue {
  return {
    id: newServiceId(),
    price: "",
    priceFrom: false,
    modalities: [],
    availability: "",
    currency: "CRC",
    contactPhone: "",
  };
}

/**
 * Validate + convert the create form to a data-layer ServiceConfigInput. The name/description come
 * from the page (the top-level fields); this folds in price, currency, modality, availability, media
 * and contact. Returns a Spanish error when invalid: the service needs a name; the price is OPTIONAL
 * but, when present, must be a number > 0 (a blank price means "consultar"). The service keeps its
 * stable id and its media. The result is a one-service `services` array.
 */
export function toServiceInput(
  value: ServiceFormValue,
  service: { name: string; description: string },
): { ok: true; input: ServiceConfigInput } | { ok: false; error: string } {
  const name = service.name.trim();
  if (!name) return { ok: false, error: "Ingresa el nombre del servicio." };
  const priceStr = value.price.trim();
  if (priceStr) {
    const price = Number(priceStr);
    if (!Number.isFinite(price) || price <= 0) {
      return {
        ok: false,
        error: "El precio del servicio debe ser mayor a 0 (o déjalo en blanco).",
      };
    }
  }
  const availability = value.availability.trim();
  return {
    ok: true,
    input: {
      services: [
        {
          id: value.id,
          name,
          description: service.description.trim(),
          ...(priceStr ? { price: Number(priceStr) } : {}),
          ...(priceStr && value.priceFrom ? { priceFrom: true } : {}),
          ...(value.modalities.length > 0 ? { modalities: value.modalities } : {}),
          ...(availability ? { availability } : {}),
          ...(value.photos && value.photos.length > 0 ? { photos: value.photos } : {}),
          ...(value.videoUrl ? { videoUrl: value.videoUrl } : {}),
        },
      ],
      currency: value.currency,
    },
  };
}

export function ServiceItemsEditor({
  value,
  onChange,
  schoolId,
  toolId,
}: {
  value: ServiceFormValue;
  // A functional setter (the page passes setServiceForm directly). Every mutation computes from the
  // LATEST state via the prev updater, so an async media upload that resolves after the board edited
  // a field merges its delta instead of reverting the form to the stale snapshot captured when the
  // upload began.
  onChange: Dispatch<SetStateAction<ServiceFormValue>>;
  /** School id + the create page's pre-allocated tool id — the service media upload path. */
  schoolId: string;
  toolId: string;
}) {
  const hasPrice = value.price.trim() !== "";
  const toggleModality = (m: ServiceModality) =>
    onChange((prev) => ({
      ...prev,
      modalities: prev.modalities.includes(m)
        ? prev.modalities.filter((x) => x !== m)
        : [...prev.modalities, m],
    }));

  return (
    <div className="flex flex-col gap-4">
      <Field label="Moneda">
        <select
          value={value.currency}
          onChange={(e) => {
            const currency = e.target.value as ProjectCurrency;
            onChange((prev) => ({ ...prev, currency }));
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

      <fieldset>
        <legend className="text-sm font-medium text-foreground">
          Modalidad (opcional)
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SERVICE_MODALITIES.map((m) => {
            const on = value.modalities.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => toggleModality(m)}
                className={`inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium ring-1 transition-colors ${
                  on
                    ? "bg-brand-tint text-brand-darker ring-brand-darker/30"
                    : "bg-surface text-muted ring-black/5 hover:text-foreground"
                }`}
              >
                {SERVICE_MODALITY_LABELS[m]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field label="Horario / disponibilidad (opcional)">
        <input
          type="text"
          maxLength={SERVICE_AVAILABILITY_MAX}
          value={value.availability}
          onChange={(e) => {
            const availability = e.target.value;
            onChange((prev) => ({ ...prev, availability }));
          }}
          className="input"
          placeholder="Ej.: Lun a vie, 2–6 pm"
        />
      </Field>

      <Field label={`Precio (${value.currency}) — opcional`}>
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={value.price}
          onChange={(e) => {
            const price = e.target.value;
            onChange((prev) => ({ ...prev, price }));
          }}
          className="input"
          placeholder="Déjalo en blanco si es a consultar"
        />
      </Field>
      {/* "Desde" only makes sense with a price; disabled (and off) when blank. */}
      <label
        className={`flex items-center gap-2 text-xs ${
          hasPrice ? "text-foreground" : "text-muted"
        }`}
      >
        <input
          type="checkbox"
          checked={hasPrice && value.priceFrom}
          disabled={!hasPrice}
          onChange={(e) => {
            const priceFrom = e.target.checked;
            onChange((prev) => ({ ...prev, priceFrom }));
          }}
          className="h-4 w-4 rounded border-black/20 text-brand-darker focus:ring-brand"
        />
        Mostrar como precio “desde” (orientativo)
      </label>

      <ToolItemCard
        title="Fotos y video del servicio"
        removeLabel=""
        canRemove={false}
        onRemove={() => {}}
        photos={value.photos ?? []}
        videoUrl={value.videoUrl}
        photoMax={SERVICE_PHOTO_MAX}
        schoolId={schoolId}
        toolId={toolId}
        // Media uploads to the pre-allocated tool path (valid before the doc exists), so it can
        // always attach here — there's no unsaved item to gate on, unlike the edit page.
        persisted
        unsavedHint=""
        onMedia={async (media) =>
          onChange((prev) => ({
            ...prev,
            ...(media.photos !== undefined ? { photos: media.photos } : {}),
            ...(media.videoUrl !== undefined
              ? { videoUrl: media.videoUrl ?? undefined }
              : {}),
          }))
        }
      >
        <p className="text-xs text-muted">
          Fotos del servicio (hasta {SERVICE_PHOTO_MAX}) y un video corto (opcional).
        </p>
      </ToolItemCard>
    </div>
  );
}
