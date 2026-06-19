"use client";

/**
 * The service-catalog inputs for the CREATE form (the seam the ToolTypePicker opens, like
 * SaleProductsEditor). Essentially the products editor without a required price: it collects each
 * service as TEXT — name, description, an OPTIONAL price — plus the catalog currency and the
 * optional WhatsApp number for the per-service "Preguntar" button. Per-service media (photos + a
 * short video) is added later on the edit page. There is no order flow.
 *
 * Controlled: the parent owns a ServiceFormValue (value + onChange). Validation/conversion to the
 * data-layer ServiceConfigInput lives here too; the stable service `id` is assigned at that point
 * (in an event handler — never during render — so it's SSR-safe and persists across edits).
 */
import { Field } from "@/components/ui/Field";
import {
  PROJECT_CURRENCIES,
  SERVICE_DESCRIPTION_MAX,
  SERVICE_ITEM_MAX,
  SERVICE_NAME_MAX,
  type ProjectCurrency,
} from "@/types";
import type { ServiceConfigInput } from "@/lib/firestore";

/** A service as the create form holds it (text only; media + the stable id come later). */
export interface ServiceItemDraft {
  name: string;
  description: string;
  /** Price as the input holds it (string); optional (blank = quote-based). */
  price: string;
}

export function emptyServiceItem(): ServiceItemDraft {
  return { name: "", description: "", price: "" };
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

/** A stable id for a service, generated in an event handler (SSR-safe). Shared with the edit
 * page, which mints ids for services added there. */
export function newServiceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Validate + convert the create form to a data-layer ServiceConfigInput. Returns a Spanish error
 * when invalid. Trailing empty services (no name, description or price) are dropped; at least one
 * service is required, and every service with content needs a name. The price is OPTIONAL, but
 * when present it must be a number > 0 (a blank price means "consultar").
 */
export function toServiceInput(
  value: ServiceFormValue,
): { ok: true; input: ServiceConfigInput } | { ok: false; error: string } {
  const services = value.services
    .map((s) => ({
      name: s.name.trim(),
      description: s.description.trim(),
      priceStr: s.price.trim(),
    }))
    .filter((s) => s.name || s.description || s.priceStr);
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
        id: newServiceId(),
        name: s.name,
        description: s.description,
        ...(s.priceStr ? { price: Number(s.priceStr) } : {}),
      })),
      currency: value.currency,
      ...(contactPhone ? { contactPhone } : {}),
    },
  };
}

export function ServiceItemsEditor({
  value,
  onChange,
}: {
  value: ServiceFormValue;
  onChange: (v: ServiceFormValue) => void;
}) {
  const updateItem = (i: number, patch: Partial<ServiceItemDraft>) =>
    onChange({
      ...value,
      services: value.services.map((s, idx) =>
        idx === i ? { ...s, ...patch } : s,
      ),
    });
  const removeItem = (i: number) =>
    onChange({
      ...value,
      services: value.services.filter((_, idx) => idx !== i),
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

      {value.services.map((service, i) => (
        <fieldset
          key={i}
          className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold tracking-tight text-foreground">
              Servicio {i + 1}
            </legend>
            {value.services.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
              >
                Quitar
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Nombre del servicio">
              <input
                type="text"
                maxLength={SERVICE_NAME_MAX}
                value={service.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
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
                  updateItem(i, { description: e.target.value })
                }
                className="input"
                placeholder="Contá en qué consiste el servicio."
              />
            </Field>
            <Field label={`Precio (${value.currency}) — opcional`}>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={service.price}
                onChange={(e) => updateItem(i, { price: e.target.value })}
                className="input"
                placeholder="Dejalo en blanco si es a consultar"
              />
            </Field>
          </div>
        </fieldset>
      ))}

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
        dejás en blanco, usa el teléfono de la junta de la escuela. Las fotos y el
        video de cada servicio se agregan al editar la herramienta.
      </p>
    </div>
  );
}
