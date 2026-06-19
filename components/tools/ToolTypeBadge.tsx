import { Badge } from "@/components/ui/Badge";
import { toolTypeMeta } from "@/lib/tools/registry";
import type { ToolType } from "@/types";

/**
 * Pill naming a tool's kind (Rifa, Bingo, Venta…). The label comes from the registry, so it
 * can never drift from the editor picker. Server-safe.
 */
export function ToolTypeBadge({ type }: { type: ToolType }) {
  return <Badge tone="info">{toolTypeMeta(type).label}</Badge>;
}
