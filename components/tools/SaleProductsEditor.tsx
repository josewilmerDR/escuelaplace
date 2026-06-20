"use client";

/**
 * The product-catalog inputs for the CREATE form (the seam the ToolTypePicker opens, like
 * RaffleConfigFields / TourStagesEditor). It collects each product as name, description, price
 * AND its media (photos + a short video), plus the catalog currency and the optional WhatsApp
 * number for the per-product "Consultar" button. Media uploads immediately to the tool's Storage
 * path (the create page pre-allocates the tool id so the path is valid before the doc exists) and
 * the URLs ride along in the single `createTool` write — so the whole catalog, media included, is
 * filled here and the board returns to the hub (mirrors the rifa flow). The per-product card is
 * the shared <ToolItemCard>, the same media block the edit page uses.
 *
 * Controlled: the parent owns a SaleFormValue (value + onChange). Validation/conversion to the
 * data-layer SaleConfigInput lives here too; the stable product `id` is minted when a product is
 * ADDED (in an event handler — never during render — so it's SSR-safe and persists across edits)
 * and carried through, so orders can reference it and media attaches to the right product.
 */
import type { Dispatch, SetStateAction } from "react";
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { Field } from "@/components/ui/Field";
import {
  PROJECT_CURRENCIES,
  SALE_PRODUCT_DESCRIPTION_MAX,
  SALE_PRODUCT_MAX,
  SALE_PRODUCT_NAME_MAX,
  SALE_PRODUCT_PHOTO_MAX,
  type ProjectCurrency,
} from "@/types";
import type { SaleConfigInput } from "@/lib/firestore";

/** A product as the create form holds it: text + the already-uploaded media URLs + a stable id. */
export interface SaleProductDraft {
  /** Stable id (minted on add); referenced by orders and the media match key. */
  id: string;
  name: string;
  description: string;
  /** Price as the input holds it (string). */
  price: string;
  /** Photos already uploaded to Storage (URLs). */
  photos?: string[];
  /** A short video already uploaded to Storage (URL). */
  videoUrl?: string;
}

/** A stable id for a product, generated in an event handler (SSR-safe). Shared with the edit
 * page, which mints ids for products added there. */
export function newProductId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptySaleProduct(): SaleProductDraft {
  return { id: newProductId(), name: "", description: "", price: "" };
}

/** The full create-form value: products + the catalog currency + the optional WhatsApp. */
export interface SaleFormValue {
  products: SaleProductDraft[];
  currency: ProjectCurrency;
  contactPhone: string;
}

export function emptySaleForm(): SaleFormValue {
  return { products: [emptySaleProduct()], currency: "CRC", contactPhone: "" };
}

/**
 * Validate + convert the create form to a data-layer SaleConfigInput. Returns a Spanish error
 * when invalid. Trailing empty products (no name, description, price OR media) are dropped; at
 * least one product is required, and every product that has any content needs a name and a
 * price > 0. Each surviving product keeps its stable id (orders reference it) and its media.
 */
export function toSaleInput(
  value: SaleFormValue,
): { ok: true; input: SaleConfigInput } | { ok: false; error: string } {
  const products = value.products
    .map((p) => ({
      id: p.id,
      name: p.name.trim(),
      description: p.description.trim(),
      priceStr: p.price.trim(),
      photos: p.photos,
      videoUrl: p.videoUrl,
    }))
    .filter(
      (p) =>
        p.name ||
        p.description ||
        p.priceStr ||
        (p.photos?.length ?? 0) > 0 ||
        Boolean(p.videoUrl),
    );
  if (products.length === 0) {
    return {
      ok: false,
      error: "Agregá al menos un producto con su nombre y precio.",
    };
  }
  for (const p of products) {
    if (!p.name) return { ok: false, error: "Cada producto necesita un nombre." };
    const price = Number(p.priceStr);
    if (!Number.isFinite(price) || price <= 0) {
      return {
        ok: false,
        error: `Ingresá un precio mayor a 0 para «${p.name}».`,
      };
    }
  }
  const contactPhone = value.contactPhone.trim();
  return {
    ok: true,
    input: {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.priceStr),
        ...(p.photos && p.photos.length > 0 ? { photos: p.photos } : {}),
        ...(p.videoUrl ? { videoUrl: p.videoUrl } : {}),
      })),
      currency: value.currency,
      ...(contactPhone ? { contactPhone } : {}),
    },
  };
}

export function SaleProductsEditor({
  value,
  onChange,
  schoolId,
  toolId,
}: {
  value: SaleFormValue;
  // A functional setter (the page passes setSaleForm directly). Every mutation computes from the
  // LATEST state via the prev updater, so an async per-product media upload that resolves after
  // the board edited text (or after another card's upload) merges its delta instead of reverting
  // the form to the stale snapshot captured when the upload began.
  onChange: Dispatch<SetStateAction<SaleFormValue>>;
  /** School id + the create page's pre-allocated tool id — the per-product media upload path. */
  schoolId: string;
  toolId: string;
}) {
  const updateProduct = (id: string, patch: Partial<SaleProductDraft>) =>
    onChange((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }));
  const removeProduct = (id: string) =>
    onChange((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
    }));
  const addProduct = () =>
    onChange((prev) => ({
      ...prev,
      products: [...prev.products, emptySaleProduct()],
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

      {value.products.map((product, i) => (
        <ToolItemCard
          key={product.id}
          title={`Producto ${i + 1}`}
          removeLabel="Quitar producto"
          canRemove={value.products.length > 1}
          onRemove={() => removeProduct(product.id)}
          photos={product.photos ?? []}
          videoUrl={product.videoUrl}
          photoMax={SALE_PRODUCT_PHOTO_MAX}
          schoolId={schoolId}
          toolId={toolId}
          // Media uploads to the pre-allocated tool path (valid before the doc exists), so it can
          // always attach here — there's no unsaved item to gate on, unlike the edit page.
          persisted
          unsavedHint=""
          onMedia={async (media) =>
            updateProduct(product.id, {
              ...(media.photos !== undefined ? { photos: media.photos } : {}),
              ...(media.videoUrl !== undefined
                ? { videoUrl: media.videoUrl ?? undefined }
                : {}),
            })
          }
        >
          <Field label="Nombre del producto">
            <input
              type="text"
              maxLength={SALE_PRODUCT_NAME_MAX}
              value={product.name}
              onChange={(e) => updateProduct(product.id, { name: e.target.value })}
              className="input"
              placeholder="Ej.: Huevos de la granja de la escuela"
            />
          </Field>
          <Field label="Descripción">
            <textarea
              rows={3}
              maxLength={SALE_PRODUCT_DESCRIPTION_MAX}
              value={product.description}
              onChange={(e) =>
                updateProduct(product.id, { description: e.target.value })
              }
              className="input"
              placeholder="Contá qué es, presentación, etc."
            />
          </Field>
          <Field label={`Precio (${value.currency})`}>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={product.price}
              onChange={(e) =>
                updateProduct(product.id, { price: e.target.value })
              }
              className="input"
              placeholder="Ej.: 2500"
            />
          </Field>
        </ToolItemCard>
      ))}

      {value.products.length < SALE_PRODUCT_MAX ? (
        <button
          type="button"
          onClick={addProduct}
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
          value={value.contactPhone}
          onChange={(e) => {
            const contactPhone = e.target.value;
            onChange((prev) => ({ ...prev, contactPhone }));
          }}
          className="input"
          placeholder="Ej.: 8888 8888"
        />
      </Field>
      <p className="-mt-2 text-xs text-muted">
        El botón “Consultar” de cada producto abrirá WhatsApp con este número. Si lo
        dejás en blanco, usa el teléfono de la junta de la escuela.
      </p>
    </div>
  );
}
