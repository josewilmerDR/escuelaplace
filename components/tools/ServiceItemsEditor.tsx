"use client";

/**
 * The service-catalog inputs for the CREATE form (the seam the ToolTypePicker opens, like
 * SaleProductsEditor). Essentially the products editor without a required price: it collects each
 * service's name, description, an OPTIONAL price, its delivery/availability extras AND its media
 * (photos + a short video), plus the catalog currency and the optional WhatsApp number for the
 * per-service "Preguntar" button. Media uploads immediately to the tool's Storage path (the create
 * page pre-allocates the tool id) and the URLs ride along in the single `createTool` write, so the
 * whole catalog is filled here. There is no order flow. The per-service card is the shared
 * <ToolItemCard>, the same media block the edit page uses.
 *
 * Controlled: the parent owns a ServiceFormValue (value + onChange). Validation/conversion to the
 * data-layer ServiceConfigInput lives here too; the stable service `id` is minted when a service
 * is ADDED (in an event handler — never during render — so it's SSR-safe) and carried through.
 */
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { Field } from "@/components/ui/Field";
import {
  PROJECT_CURRENCIES,
  SERVICE_AVAILABILITY_MAX,
  SERVICE_DESCRIPTION_MAX,
  SERVICE_ITEM_MAX,
  SERVICE_MODALITIES,
  SERVICE_MODALITY_LABELS,
  SERVICE_NAME_MAX,
  SERVICE_PHOTO_MAX,
  type ProjectCurrency,
  type ServiceModality,
} from "@/types";
import type { ServiceConfigInput } from "@/lib/firestore";

/** A service as the create form holds it: text + media URLs + a stable id. */
export interface ServiceItemDraft {
  /** Stable id (minted on add); the media match key. */
  id: string;
  name: string;
  description: string;
  /** Price as the input holds it (string); optional (blank = quote-based). */
  price: string;
  /** Show the price as a starting point ("Desde ₡X"); only used when a price is set. */
  priceFrom: boolean;
  /** How the service is delivered (presencial / a domicilio / virtual). */
  modalities: ServiceModality[];
  /** Free-text schedule/availability. */
  availability: string;
  /** Photos already uploaded to Storage (URLs). */
  photos?: string[];
  /** A short video already uploaded to Storage (URL). */
  videoUrl?: string;
}

/** A stable id for a service, generated in an event handler (SSR-safe). Shared with the edit
 * page, which mints ids for services added there. */
export function newServiceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyServiceItem(): ServiceItemDraft {
  return {
    id: newServiceId(),
    name: "",
    description: "",
    price: "",
    priceFrom: false,
    modalities: [],
    availability: "",
  };
}

/** The full create-form value: services + the catalog currency + the optional WhatsApp. */
export interface ServiceFormValue {
  services: ServiceItemDraft[];
  currency: ProjectCurrency;
  contactPhone: string;
}

export function emptyServiceForm(): ServiceFormValue {
  return { services: [emptyServiceItem()], currency: "CRC", contactPhone: "" };
}

/**
 * Validate + convert the create form to a data-layer ServiceConfigInput. Returns a Spanish error
 * when invalid. Trailing empty services (no name, description, price, extras OR media) are dropped;
 * at least one service is required, and every service with content needs a name. The price is
 * OPTIONAL, but when present it must be a number > 0 (a blank price means "consultar"). Each
 * surviving service keeps its stable id and its media.
 */
export function toServiceInput(
  value: ServiceFormValue,
): { ok: true; input: ServiceConfigInput } | { ok: false; error: string } {
  const services = value.services
    .map((s) => ({
      id: s.id,
      name: s.name.trim(),
      description: s.description.trim(),
      priceStr: s.price.trim(),
      priceFrom: s.priceFrom,
      modalities: s.modalities,
      availability: s.availability.trim(),
      photos: s.photos,
      videoUrl: s.videoUrl,
    }))
    .filter(
      (s) =>
        s.name ||
        s.description ||
        s.priceStr ||
        s.modalities.length > 0 ||
        s.availability ||
        (s.photos?.length ?? 0) > 0 ||
        Boolean(s.videoUrl),
    );
  if (services.length === 0) {
    return { ok: false, error: "Agregá al menos un servicio con su nombre." };
  }
  for (const s of services) {
    if (!s.name) return { ok: false, error: "Cada servicio necesita un nombre." };
    if (s.priceStr) {
      const price = Number(s.priceStr);
      if (!Number.isFinite(price) || price <= 0) {
        return {
          ok: false,
          error: `El precio de «${s.name}» debe ser mayor a 0 (o dejalo en blanco).`,
        };
      }
    }
  }
  const contactPhone = value.contactPhone.trim();
  return {
    ok: true,
    input: {
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        ...(s.priceStr ? { price: Number(s.priceStr) } : {}),
        ...(s.priceStr && s.priceFrom ? { priceFrom: true } : {}),
        ...(s.modalities.length > 0 ? { modalities: s.modalities } : {}),
        ...(s.availability ? { availability: s.availability } : {}),
        ...(s.photos && s.photos.length > 0 ? { photos: s.photos } : {}),
        ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
      })),
      currency: value.currency,
      ...(contactPhone ? { contactPhone } : {}),
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
  onChange: (v: ServiceFormValue) => void;
  /** School id + the create page's pre-allocated tool id — the per-service media upload path. */
  schoolId: string;
  toolId: string;
}) {
  const updateItem = (id: string, patch: Partial<ServiceItemDraft>) =>
    onChange({
      ...value,
      services: value.services.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });
  const removeItem = (id: string) =>
    onChange({
      ...value,
      services: value.services.filter((s) => s.id !== id),
    });
  const addItem = () =>
    onChange({ ...value, services: [...value.services, emptyServiceItem()] });

  return (
    <div className="flex flex-col gap-4">
      <Field label="Moneda">
        <select
          value={value.currency}
          onChange={(e) =>
            onChange({ ...value, currency: e.target.value as ProjectCurrency })
          }
          className="input"
        >
          {PROJECT_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      {value.services.map((service, i) => {
        const hasPrice = service.price.trim() !== "";
        return (
          <ToolItemCard
            key={service.id}
            title={`Servicio ${i + 1}`}
            removeLabel="Quitar servicio"
            canRemove={value.services.length > 1}
            onRemove={() => removeItem(service.id)}
            photos={service.photos ?? []}
            videoUrl={service.videoUrl}
            photoMax={SERVICE_PHOTO_MAX}
            schoolId={schoolId}
            toolId={toolId}
            persisted
            unsavedHint=""
            onMedia={async (media) =>
              updateItem(service.id, {
                ...(media.photos !== undefined ? { photos: media.photos } : {}),
                ...(media.videoUrl !== undefined
                  ? { videoUrl: media.videoUrl ?? undefined }
                  : {}),
              })
            }
          >
            <Field label="Nombre del servicio">
              <input
                type="text"
                maxLength={SERVICE_NAME_MAX}
                value={service.name}
                onChange={(e) => updateItem(service.id, { name: e.target.value })}
                className="input"
                placeholder="Ej.: Clases de repaso de matemática"
              />
            </Field>
            <Field label="Descripción">
              <textarea
                rows={3}
                maxLength={SERVICE_DESCRIPTION_MAX}
                value={service.description}
                onChange={(e) =>
                  updateItem(service.id, { description: e.target.value })
                }
                className="input"
                placeholder="Contá en qué consiste el servicio."
              />
            </Field>

            <fieldset>
              <legend className="text-sm font-medium text-foreground">
                Modalidad (opcional)
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {SERVICE_MODALITIES.map((m) => {
                  const on = service.modalities.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        updateItem(service.id, {
                          modalities: on
                            ? service.modalities.filter((x) => x !== m)
                            : [...service.modalities, m],
                        })
                      }
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
                value={service.availability}
                onChange={(e) =>
                  updateItem(service.id, { availability: e.target.value })
                }
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
                value={service.price}
                onChange={(e) => updateItem(service.id, { price: e.target.value })}
                className="input"
                placeholder="Dejalo en blanco si es a consultar"
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
                checked={hasPrice && service.priceFrom}
                disabled={!hasPrice}
                onChange={(e) =>
                  updateItem(service.id, { priceFrom: e.target.checked })
                }
                className="h-4 w-4 rounded border-black/20 text-brand-darker focus:ring-brand"
              />
              Mostrar como precio “desde” (orientativo)
            </label>
          </ToolItemCard>
        );
      })}

      {value.services.length < SERVICE_ITEM_MAX ? (
        <button
          type="button"
          onClick={addItem}
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
          value={value.contactPhone}
          onChange={(e) => onChange({ ...value, contactPhone: e.target.value })}
          className="input"
          placeholder="Ej.: 8888 8888"
        />
      </Field>
      <p className="-mt-2 text-xs text-muted">
        El botón “Preguntar” de cada servicio abrirá WhatsApp con este número. Si lo
        dejás en blanco, usa el teléfono de la junta de la escuela.
      </p>
    </div>
  );
}
