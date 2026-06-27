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
 *      `XConfig` interface and add it to the `ToolConfig` union (the config lives under the doc's
 *      generic `config` map — there is NO per-kind field on `Tool`).
 *   2. lib/firestore/tools.ts — `XConfigInput` + `buildXConfig` + a `case` in `buildToolConfig`; a
 *      slot on `CreateToolInput` AND `ToolPatch`; the kind in `toolConfigOf`'s ToolConfigByType (for
 *      a typed read); often an `updateToolX` immediate-save writer and a branch in
 *      `toolContactPhone`. (The `updateTool` write path is GENERIC — no per-kind arm to edit.)
 *   3. lib/tools/registry.ts — the META row (here, incl. `inactiveNotice`), plus
 *      `toolBuyLabel`/`toolBuyHref` if buyable.
 *   4. firestore.rules — the `type` enum (listed TWICE: create + update). The config guard is
 *      generic (`config is map`), so a config-only kind needs no other rules change.
 *   5. app/school/[id]/tool/[toolId]/page.tsx — an async detail render that wraps its body in
 *      `<ToolDetailShell>` (the shared chrome), registered in `TOOL_DETAIL_RENDERERS` (a lookup,
 *      not an if-branch). Kinds with no entry fall through to the generic render.
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
  CrownIcon,
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
  /** Full sentence shown on the public detail page when the tool is not `active` (so it's hidden
   * from the school page but still reachable by direct URL). Spelled out per kind because the
   * Spanish subject + verb agreement ("Esta rifa no está activa" vs "Estos productos no están
   * activos") isn't derivable from `label`. */
  inactiveNotice: string;
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
    inactiveNotice:
      "Esta rifa no está activa por el momento, así que no aparece en la página de la escuela.",
    icon: TicketIcon,
  },
  bingo: {
    key: "bingo",
    label: "Bingo",
    pluralLabel: "Bingos",
    hint: "Juego de cartones para recaudar fondos.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Bingo familiar pro fondos para la gira",
    inactiveNotice:
      "Este bingo no está activo por el momento, así que no aparece en la página de la escuela.",
    icon: GridIcon,
  },
  sale: {
    key: "sale",
    label: "Productos",
    pluralLabel: "Productos",
    hint: "Catálogo de productos a la venta (comida, artículos…).",
    titleLabel: "Nombre del producto",
    titlePlaceholder: "Ej.: Huevos de la granja de la escuela",
    inactiveNotice:
      "Estos productos no están activos por el momento, así que no aparecen en la página de la escuela.",
    icon: ShoppingBagIcon,
  },
  service: {
    key: "service",
    label: "Servicios",
    pluralLabel: "Servicios",
    hint: "Catálogo de servicios que ofrece la comunidad escolar.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Clases de repaso de la comunidad escolar",
    inactiveNotice:
      "Estos servicios no están activos por el momento, así que no aparecen en la página de la escuela.",
    icon: WrenchIcon,
  },
  guided_tour: {
    key: "guided_tour",
    label: "Visita guiada",
    pluralLabel: "Visitas guiadas",
    hint: "Un recorrido o visita abierta a la comunidad.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Visita guiada a la huerta escolar",
    inactiveNotice:
      "Esta visita guiada no está activa por el momento, así que no aparece en la página de la escuela.",
    icon: MapPinIcon,
  },
  event: {
    key: "event",
    label: "Evento",
    pluralLabel: "Eventos",
    hint: "Una actividad puntual con fecha (feria, acto, kermés…).",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Feria de fin de año",
    inactiveNotice:
      "Este evento no está activo por el momento, así que no aparece en la página de la escuela.",
    icon: CalendarIcon,
  },
  pageant: {
    key: "pageant",
    label: "Reinado",
    pluralLabel: "Reinados",
    hint: "Reinado escolar: candidatas/os que la comunidad apoya pro fondos.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Reinado pro fondos para la gira",
    inactiveNotice:
      "Este reinado no está activo por el momento, así que no aparece en la página de la escuela.",
    icon: CrownIcon,
  },
  other: {
    key: "other",
    label: "Otro",
    pluralLabel: "Otras actividades",
    hint: "Cualquier otra actividad puntual.",
    titleLabel: "Título",
    titlePlaceholder: "Ej.: Actividad pro fondos para la gira",
    inactiveNotice:
      "Esta actividad no está activa por el momento, así que no aparece en la página de la escuela.",
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
 * wording ("Crear actividad") rather than the awkward "Crear otro". Shared by the creation page
 * heading/submit button and the per-kind manage page's "Crear" CTA.
 */
export function createToolTitle(type: ToolType): string {
  return type === "other"
    ? "Crear actividad"
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
 * Section / button label for deleting ONE tool of a kind — "Eliminar rifa", "Eliminar reinado"… —
 * the delete-action counterpart of create/editToolTitle, built from the same registry label. It names
 * the kind to make clear it removes a SINGLE tool instance, not the kind itself; the catch-all "Otro"
 * keeps the generic "Eliminar herramienta" rather than the awkward "Eliminar otro".
 */
export function deleteToolTitle(type: ToolType): string {
  return type === "other"
    ? "Eliminar herramienta"
    : `Eliminar ${toolTypeMeta(type).label.toLowerCase()}`;
}

/**
 * The buy CTA label for the kinds with a purchase/support flow (rifa/bingo/venta + reinado→
 * "Apoyar"), or null for kinds that don't (tour/servicio/evento/otro — those use "Consultar"
 * instead). Drives the optional action button on the feed card. Keep its non-null kinds in sync
 * with `toolBuyHref`.
 */
export function toolBuyLabel(type: ToolType): string | null {
  switch (type) {
    case "raffle":
      return "Comprar números";
    case "bingo":
      return "Comprar cartones";
    case "sale":
      return "Comprar";
    case "pageant":
      return "Apoyar";
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
    // A reinado's support is per-candidate, picked on the detail page — land on its roster section.
    case "pageant":
      return `${ids.detailHref}#candidatas`;
    default:
      return null;
  }
}
