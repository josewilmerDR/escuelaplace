/**
 * The registry of school "Herramientas" kinds — the single place to add or remove a tool
 * type. Each entry is PURE PRESENTATION (a Spanish label, a one-line helper, an icon); the
 * generic create / edit / render flow is identical for every kind, so a new kind needs only
 * a row here plus its key in `ToolType` (types/firestore.ts) and the firestore.rules
 * allow-list. Order here is the order shown in the editor picker.
 *
 * Server-safe: it pulls only the inline SVG icons (no "use client"), so it renders from both
 * the public SSR pages and the client panel.
 */
import type { ComponentType } from "react";
import {
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
  /** One-line helper shown under the picker so the board knows what each kind is for. */
  hint: string;
  /** Icon used as the card's image fallback and the badge mark. */
  icon: ComponentType<{ className?: string }>;
}

const META: Record<ToolType, ToolTypeMeta> = {
  raffle: {
    key: "raffle",
    label: "Rifa",
    hint: "Sorteo de un premio entre quienes participan.",
    icon: TicketIcon,
  },
  bingo: {
    key: "bingo",
    label: "Bingo",
    hint: "Juego de cartones para recaudar fondos.",
    icon: GridIcon,
  },
  sale: {
    key: "sale",
    label: "Productos",
    hint: "Catálogo de productos a la venta (comida, artículos…).",
    icon: ShoppingBagIcon,
  },
  service: {
    key: "service",
    label: "Servicio",
    hint: "Un servicio que ofrece la comunidad escolar.",
    icon: WrenchIcon,
  },
  guided_tour: {
    key: "guided_tour",
    label: "Visita guiada",
    hint: "Un recorrido o visita abierta a la comunidad.",
    icon: MapPinIcon,
  },
  other: {
    key: "other",
    label: "Otro",
    hint: "Cualquier otra actividad puntual.",
    icon: SparklesIcon,
  },
};

/** Ordered list for pickers and iteration (insertion order = declared order above). */
export const TOOL_TYPE_LIST: ToolTypeMeta[] = Object.values(META);

/** Presentation for a stored type, falling back to "Otro" for unknown/legacy values. */
export function toolTypeMeta(type: ToolType | string): ToolTypeMeta {
  return META[type as ToolType] ?? META.other;
}
