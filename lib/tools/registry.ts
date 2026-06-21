/**
 * The registry of school "Herramientas" kinds — the single source of truth for a kind's
 * PRESENTATION: a Spanish label, a one-line helper, an icon, the create/edit titles, and (for
 * the buyable kinds) the buy CTA label/href. It drives the presentation-only surfaces — the hub
 * directory + per-kind counts, the manage-page list, the card badge/icon, and the public feed
 * card. Order here is the order shown in the editor picker.
 *
 * IMPORTANT — this is NOT a plugin seam. Adding a kind is NOT "just a row here": a registry row
 * only makes the kind appear in the directory/list/card/badge. A kind that carries configuration
 * or a buy/contact flow is wired BY HAND across several files the registry does not abstract
 * away. A new CONFIG-BEARING kind realistically touches:
 *   1. types/firestore.ts — add to the `ToolType` union AND the `TOOL_TYPES` array; add an
 *      `XConfig` interface and an optional `x?: XConfig` field on `Tool`.
 *   2. lib/firestore/tools.ts — `XConfigInput` + `buildXConfig`; a slot on `CreateToolInput` AND
 *      `ToolPatch`; a new arm in the `updateTool` type↔config ternary (and the new key added to
 *      EVERY other arm's `deleteField` list); often an `updateToolX` immediate-save writer and a
 *      branch in `toolContactPhone`.
 *   3. lib/tools/registry.ts — the META row (here), plus `toolBuyLabel`/`toolBuyHref` if buyable.
 *   4. firestore.rules — the `type` enum (listed TWICE: create + update), the `is map` config
 *      guard (in BOTH validToolCreate and validToolUpdate), and toolConfigMatchesType().
 *   5. app/school/[id]/tool/[toolId]/page.tsx — a dispatch branch + a per-kind detail render.
 *   6. app/(panel)/panel/school/[id]/tools/{new,[toolId]}/page.tsx — per-kind state, validation
 *      and JSX in BOTH the create and edit pages.
 *   7. app/school/[id]/tool/[toolId]/opengraph-image.tsx — the KIND_EMOJI entry.
 * A BUYABLE kind (its own order collection + Storage proof + buyer/confirm pages + rules) is a
 * full subsystem on top of that — see the LIGHT-vs-HEAVY note in lib/firestore/tools.ts before
 * adding one. (Only the catch-all config-less `other` kind is truly "just a row".)
 *
 * Server-safe: it pulls only the inline SVG icons (no "use client"), so it renders from both
 * the public SSR pages and the client panel.
 */
import type { ComponentType } from "react";
import {
  CalendarIcon,
  GridIcon,
  MapPinIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TicketIcon,
  WrenchIcon,
} from "@/components/ui/icons";
import type { ToolType } from "@/types";

export interface ToolTypeMeta {
  key: ToolType;
  /** Spanish label shown on the card badge, the editor picker and the panel list. */
  label: string;
  /** Plural label, for the per-kind manage page heading ("Rifas", "Visitas guiadas"…). Spanish
   * plurals aren't derivable from `label` (some labels are already plural, "Otro" → "Otras
   * herramientas"), so each kind spells out its own. */
  pluralLabel: string;
  /** One-line helper shown under the picker so the board knows what each kind is for. */
  hint: string;
  /** Label for the create/edit form's title field, phrased for this kind. Most kinds keep the
   * generic "Título"; the product catalog reads better as "Nombre del producto". */
  titleLabel: string;
  /** Example title shown as the create form's placeholder, phrased for this kind. */
  titlePlaceholder: string;
  /** Icon used as the card's image fallback and the badge mark. */
  icon: ComponentType<{ className?: string }>;
}

const META: Record<ToolType, ToolTypeMeta> = {
  raffle: {
    key: "raffle",
    label: "Rifa",
    pluralLabel: "Rifas",
    hint: "Sorteo de un premio entre quienes participan.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Rifa pro fondos para la gira",
    icon: TicketIcon,
  },
  bingo: {
    key: "bingo",
    label: "Bingo",
    pluralLabel: "Bingos",
    hint: "Juego de cartones para recaudar fondos.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Bingo familiar pro fondos para la gira",
    icon: GridIcon,
  },
  sale: {
    key: "sale",
    label: "Productos",
    pluralLabel: "Productos",
    hint: "Catálogo de productos a la venta (comida, artículos…).",
    titleLabel: "Nombre del producto",
    titlePlaceholder: "Ej.: Huevos de la granja de la escuela",
    icon: ShoppingBagIcon,
  },
  service: {
    key: "service",
    label: "Servicios",
    pluralLabel: "Servicios",
    hint: "Catálogo de servicios que ofrece la comunidad escolar.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Clases de repaso de la comunidad escolar",
    icon: WrenchIcon,
  },
  guided_tour: {
    key: "guided_tour",
    label: "Visita guiada",
    pluralLabel: "Visitas guiadas",
    hint: "Un recorrido o visita abierta a la comunidad.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Visita guiada a la huerta escolar",
    icon: MapPinIcon,
  },
  event: {
    key: "event",
    label: "Evento",
    pluralLabel: "Eventos",
    hint: "Una actividad puntual con fecha (feria, acto, kermés…).",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Feria de fin de año",
    icon: CalendarIcon,
  },
  other: {
    key: "other",
    label: "Otro",
    pluralLabel: "Otras herramientas",
    hint: "Cualquier otra actividad puntual.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Actividad pro fondos para la gira",
    icon: SparklesIcon,
  },
};

/** Ordered list for pickers and iteration (insertion order = declared order above). */
export const TOOL_TYPE_LIST: ToolTypeMeta[] = Object.values(META);

/** Presentation for a stored type, falling back to "Otro" for unknown/legacy values. */
export function toolTypeMeta(type: ToolType | string): ToolTypeMeta {
  return META[type as ToolType] ?? META.other;
}

/**
 * Page title / button label for creating a kind — "Crear rifa", "Crear bingo"… — built from the
 * registry label (the single source of truth). The catch-all "Otro" kind keeps the generic
 * wording ("Crear herramienta") rather than the awkward "Crear otro". Shared by the creation page
 * heading/submit button and the per-kind manage page's "Crear" CTA.
 */
export function createToolTitle(type: ToolType): string {
  return type === "other"
    ? "Crear herramienta"
    : `Crear ${toolTypeMeta(type).label.toLowerCase()}`;
}

/**
 * Page title for editing a kind — "Editar rifa", "Editar producto"… — the edit-page counterpart of
 * `createToolTitle`, built from the same registry label. The catch-all "Otro" kind keeps the
 * generic "Editar herramienta" rather than the awkward "Editar otro".
 */
export function editToolTitle(type: ToolType): string {
  return type === "other"
    ? "Editar herramienta"
    : `Editar ${toolTypeMeta(type).label.toLowerCase()}`;
}

/**
 * The buy CTA label for the kinds that have a purchase flow (rifa/bingo/venta), or null for kinds
 * that don't (tour/servicio/evento/otro — those use "Consultar" instead). Drives the optional
 * "Comprar" button on the feed card. Keep its non-null kinds in sync with `toolBuyHref`.
 */
export function toolBuyLabel(type: ToolType): string | null {
  switch (type) {
    case "raffle":
      return "Comprar números";
    case "bingo":
      return "Comprar cartones";
    case "sale":
      return "Comprar";
    default:
      return null;
  }
}

/**
 * Where the feed card's "Comprar" button points. Bingo has NO per-cartón selection (the buyer just
 * picks a quantity), so it skips the detail page and lands the buyer straight on the order/payment
 * page — the page itself re-checks the school is verified and cartones are available, degrading to
 * an explanatory state when not. Rifa (pick numbers) and venta (pick products) DO need an in-page
 * selection step first, so they jump to the detail page's buy section instead. Returns null for
 * kinds with no purchase flow. Keep the non-null kinds in sync with `toolBuyLabel`.
 */
export function toolBuyHref(
  type: ToolType,
  ids: { schoolId: string; toolId: string; detailHref: string },
): string | null {
  switch (type) {
    case "bingo":
      return `/panel/bingo-order?schoolId=${ids.schoolId}&toolId=${ids.toolId}`;
    case "raffle":
    case "sale":
      return `${ids.detailHref}#comprar`;
    default:
      return null;
  }
}
