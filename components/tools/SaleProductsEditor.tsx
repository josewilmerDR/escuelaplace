"use client";

/**
 * The product-catalog inputs for the CREATE form (the seam the ToolTypePicker opens, like
 * RaffleConfigFields / TourStagesEditor). It collects each product as TEXT only — name,
 * description, price — plus the catalog currency and the optional WhatsApp number for the
 * per-product "Consultar" button. Per-product media (photos + a short video) is added later on
 * the edit page, where uploads persist immediately against a saved product (mirrors the tour).
 *
 * Controlled: the parent owns a SaleFormValue (value + onChange). Validation/conversion to the
 * data-layer SaleConfigInput lives here too; the stable product `id` is assigned at that point
 * (in an event handler — never during render — so it's SSR-safe and persists across edits).
 */
import { Field } from "@/components/ui/Field";
import {
  PROJECT_CURRENCIES,
  SALE_PRODUCT_DESCRIPTION_MAX,
  SALE_PRODUCT_MAX,
  SALE_PRODUCT_NAME_MAX,
  type ProjectCurrency,
} from "@/types";
import type { SaleConfigInput } from "@/lib/firestore";

/** A product as the create form holds it (text only; media + the stable id come later). */
export interface SaleProductDraft {
  name: string;
  description: string;
  /** Price as the input holds it (string). */
  price: string;
}

export function emptySaleProduct(): SaleProductDraft {
  return { name: "", description: "", price: "" };
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

/** A stable id for a product, generated in an event handler (SSR-safe). Shared with the edit
 * page, which mints ids for products added there. */
export function newProductId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Validate + convert the create form to a data-layer SaleConfigInput. Returns a Spanish error
 * when invalid. Trailing empty products (no name, description or price) are dropped; at least
 * one product is required, and every product that has any content needs a name and a price > 0.
 * Each surviving product gets a fresh stable id here (orders reference it).
 */
export function toSaleInput(
  value: SaleFormValue,
): { ok: true; input: SaleConfigInput } | { ok: false; error: string } {
  const products = value.products
    .map((p) => ({
      name: p.name.trim(),
      description: p.description.trim(),
      priceStr: p.price.trim(),
    }))
    .filter((p) => p.name || p.description || p.priceStr);
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
        id: newProductId(),
        name: p.name,
        description: p.description,
        price: Number(p.priceStr),
      })),
      currency: value.currency,
      ...(contactPhone ? { contactPhone } : {}),
    },
  };
}

export function SaleProductsEditor({
  value,
  onChange,
}: {
  value: SaleFormValue;
  onChange: (v: SaleFormValue) => void;
}) {
  const updateProduct = (i: number, patch: Partial<SaleProductDraft>) =>
    onChange({
      ...value,
      products: value.products.map((p, idx) =>
        idx === i ? { ...p, ...patch } : p,
      ),
    });
  const removeProduct = (i: number) =>
    onChange({
      ...value,
      products: value.products.filter((_, idx) => idx !== i),
    });
  const addProduct = () =>
    onChange({ ...value, products: [...value.products, emptySaleProduct()] });

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

      {value.products.map((product, i) => (
        <fieldset
          key={i}
          className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold tracking-tight text-foreground">
              Producto {i + 1}
            </legend>
            {value.products.length > 1 && (
              <button
                type="button"
                onClick={() => removeProduct(i)}
                className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-error"
              >
                Quitar
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Nombre del producto">
              <input
                type="text"
                maxLength={SALE_PRODUCT_NAME_MAX}
                value={product.name}
                onChange={(e) => updateProduct(i, { name: e.target.value })}
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
                  updateProduct(i, { description: e.target.value })
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
                onChange={(e) => updateProduct(i, { price: e.target.value })}
                className="input"
                placeholder="Ej.: 2500"
              />
            </Field>
          </div>
        </fieldset>
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
          onChange={(e) => onChange({ ...value, contactPhone: e.target.value })}
          className="input"
          placeholder="Ej.: 8888 8888"
        />
      </Field>
      <p className="-mt-2 text-xs text-muted">
        El botón “Consultar” de cada producto abrirá WhatsApp con este número. Si lo
        dejás en blanco, usa el teléfono de la junta de la escuela. Las fotos y el
        video de cada producto se agregan al editar la herramienta.
      </p>
    </div>
  );
}
