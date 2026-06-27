"use client";

/**
 * The product inputs for the CREATE form (the seam the ToolTypePicker opens, like
 * RaffleConfigFields / TourStagesEditor). A "Productos" tool is, for now, a SINGLE product: its
 * name and description are the tool's own title/description (collected by the create page's
 * top-level fields), so this editor only adds what's specific to a product — the currency, the
 * price, its media (photos + a short video) and the optional WhatsApp number for the "Consultar"
 * button. Media uploads immediately to the tool's Storage path (the create page pre-allocates the
 * tool id so the path is valid before the doc exists) and the URLs ride along in the single
 * `createTool` write — so the whole product, media included, is filled here and the board returns
 * to the hub (mirrors the rifa flow).
 *
 * The data model still stores `sale.products` as an ARRAY (with one item here): that's where a
 * future catalog — a union of previously created products — would plug in, so the public page,
 * the buy flow and product orders need no change. The product's stable `id` is minted when the
 * form is initialized (in a useState lazy initializer — never rendered to the DOM, so SSR-safe)
 * and carried through, so orders can reference it and media attaches to the right product.
 *
 * Controlled: the parent owns a SaleFormValue (value + onChange). Validation/conversion to the
 * data-layer SaleConfigInput lives here too — `toSaleInput` takes the product's name/description
 * from the page (the top-level fields) and folds in this editor's price/currency/media/contact.
 */
import type { Dispatch, SetStateAction } from "react";
import { ToolItemCard } from "@/components/tools/ToolItemCard";
import { Field } from "@/components/ui/Field";
import {
  PROJECT_CURRENCIES,
  SALE_PRODUCT_PHOTO_MAX,
  type ProjectCurrency,
} from "@/types";
import type { SaleConfigInput } from "@/lib/firestore";
import { newLocalId } from "@/lib/local-id";

/**
 * The create-form value for a single product: its stable id, price (string while editing), the
 * currency, the optional WhatsApp and the already-uploaded media URLs. The name and description
 * live on the create page's top-level fields, not here.
 */
export interface SaleFormValue {
  /** Stable product id (minted on init); referenced by orders and the media match key. */
  id: string;
  /** Price as the input holds it (string). */
  price: string;
  currency: ProjectCurrency;
  contactPhone: string;
  /** Photos already uploaded to Storage (URLs). */
  photos?: string[];
  /** A short video already uploaded to Storage (URL). */
  videoUrl?: string;
}

export function emptySaleForm(): SaleFormValue {
  return { id: newLocalId("p"), price: "", currency: "CRC", contactPhone: "" };
}

/**
 * Validate + convert the create form to a data-layer SaleConfigInput. The name/description come
 * from the page (the top-level fields); this folds in price, currency, media and contact. Returns
 * a Spanish error when invalid: the product needs a name and a price > 0. The product keeps its
 * stable id (orders reference it) and its media. The result is a one-product `products` array.
 */
export function toSaleInput(
  value: SaleFormValue,
  product: { name: string; description: string },
): { ok: true; input: SaleConfigInput } | { ok: false; error: string } {
  const name = product.name.trim();
  if (!name) return { ok: false, error: "Ingresa el nombre del producto." };
  const priceStr = value.price.trim();
  const price = Number(priceStr);
  if (!priceStr || !Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Ingresa un precio mayor a 0 para el producto." };
  }
  return {
    ok: true,
    input: {
      products: [
        {
          id: value.id,
          name,
          description: product.description.trim(),
          price,
          ...(value.photos && value.photos.length > 0 ? { photos: value.photos } : {}),
          ...(value.videoUrl ? { videoUrl: value.videoUrl } : {}),
        },
      ],
      currency: value.currency,
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
  // LATEST state via the prev updater, so an async media upload that resolves after the board
  // edited a field merges its delta instead of reverting the form to the stale snapshot captured
  // when the upload began.
  onChange: Dispatch<SetStateAction<SaleFormValue>>;
  /** School id + the create page's pre-allocated tool id — the product media upload path. */
  schoolId: string;
  toolId: string;
}) {
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

      <Field label={`Precio (${value.currency})`}>
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
          placeholder="Ej.: 2500"
        />
      </Field>

      <ToolItemCard
        title="Fotos y video del producto"
        removeLabel=""
        canRemove={false}
        onRemove={() => {}}
        photos={value.photos ?? []}
        videoUrl={value.videoUrl}
        photoMax={SALE_PRODUCT_PHOTO_MAX}
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
          Fotos del producto (hasta {SALE_PRODUCT_PHOTO_MAX}) y un video corto (opcional).
        </p>
      </ToolItemCard>
    </div>
  );
}
