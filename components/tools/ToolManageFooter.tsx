"use client";

/**
 * The shared footer for the read-only "control center" panels (servicios / visita guiada / evento) —
 * the config-only kinds that have no orders to confirm and nothing live to follow. It closes those
 * panels with the same two public engagements the public page offers (open the activity, ask the
 * school, spread the word): a "Ver página pública" link plus the "Consultar"/"Compartir" pair
 * (<ToolCardActions>). The WhatsApp deep link is resolved exactly like the public detail page
 * (toolContactWhatsAppLink): the tool-level number, falling back to the school's board phone, hidden
 * when neither dials. PURELY INFORMATIONAL — it only opens a chat or the share sheet.
 *
 * The cockpit kinds (bingo / sale) have their own quick-links footers instead, so they don't use
 * this.
 */
import Link from "next/link";
import { ToolCardActions } from "@/components/tools/ToolCardActions";
import { toolWhatsAppConsultLink } from "@/lib/contact";
import { toolContactLabel, toolContactPhone, toolShareText } from "@/lib/firestore";
import type { SchoolDoc, ToolDoc } from "@/types";

export function ToolManageFooter({
  schoolId,
  tool,
  school,
  showShareActions = true,
}: {
  schoolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
  /** Show the "Consultar"/"Compartir" pair. Off for servicios, whose panel drops both. */
  showShareActions?: boolean;
}) {
  const toolId = tool.id;
  const publicHref = `/school/${schoolId}/tool/${toolId}`;
  const whatsappUrl = toolWhatsAppConsultLink(
    toolContactPhone(tool) || school.boardContact?.phone,
    tool.title,
    school.name,
  );
  return (
    <section className="mt-10 border-t border-border pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={publicHref} className="btn btn-outline">
          Ver página pública
        </Link>
      </div>
      {showShareActions && (
        <div className="mt-3 sm:max-w-md">
          <ToolCardActions
            whatsappUrl={whatsappUrl}
            whatsappLabel={toolContactLabel(tool)}
            sharePath={publicHref}
            shareTitle={tool.title}
            shareText={toolShareText(tool.title, school.name)}
          />
        </div>
      )}
    </section>
  );
}
