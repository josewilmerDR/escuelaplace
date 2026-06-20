import Image from "next/image";
import Link from "next/link";
import { ToolCardActions } from "@/components/tools/ToolCardActions";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { toolTypeMeta } from "@/lib/tools/registry";
import { toolContactPhone, toolWindowLabel } from "@/lib/firestore";
import { buildWhatsAppLink } from "@/lib/contact";
import { CARD_COVER_ASPECT } from "@/lib/layout";
import type { ToolDoc } from "@/types";

/**
 * Cover `sizes` for the single-column activity feed: the card caps at the feed column
 * (max-w-2xl = 672px) on desktop and is ~full-width below that. Not the shared CARD_COVER_SIZES,
 * which is tuned for the multi-column catalog grids.
 */
const FEED_COVER_SIZES = "(min-width: 720px) 672px, 100vw";

/**
 * Read-only card for a school tool (rifa/venta/etc.), shown on the public "Principal" tab.
 * The cover, title and body are a STRETCHED LINK to the tool detail page (an ::after overlay
 * covering the whole surface), and a footer offers two per-activity actions: "Consultar" (a
 * prefilled WhatsApp chat, shown only when a number resolves) and "Compartir" (Web Share, with
 * a copy-link fallback). Those buttons sit above the overlay (relative z-10) so they stay
 * independently clickable. Universal server component; only the actions are a client island.
 */
export function ToolCard({
  tool,
  boardPhone,
}: {
  tool: ToolDoc;
  /** The school's board phone — the WhatsApp fallback when the tool sets no contact of its own. */
  boardPhone?: string;
}) {
  const Icon = toolTypeMeta(tool.type).icon;
  const window = toolWindowLabel(tool);
  const detailHref = `/school/${tool.schoolId}/tool/${tool.id}`;

  // "Consultar" opens a prefilled chat on the tool's own contact, falling back to the board phone.
  // buildWhatsAppLink normalizes the number and returns null when it can't be dialed, so the button
  // is hidden rather than dead.
  const phone = toolContactPhone(tool) || boardPhone || "";
  const whatsappUrl = phone
    ? buildWhatsAppLink(
        phone,
        `¡Hola! Vi "${tool.title}" de ${tool.schoolName} en escuelaplace y quiero hacer una consulta.`,
      )
    : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <div className={`relative w-full bg-brand-tint ${CARD_COVER_ASPECT}`}>
        {tool.coverUrl ? (
          <Image
            src={tool.coverUrl}
            alt=""
            fill
            sizes={FEED_COVER_SIZES}
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-full items-center justify-center text-brand-darker/30"
          >
            <Icon className="h-10 w-10" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-foreground group-hover:text-brand-darker">
            {/* Stretched link: the ::after covers the whole card, so cover/title/body all navigate
                to the detail page, while the footer actions (relative z-10) stay clickable. */}
            <Link
              href={detailHref}
              className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
            >
              {tool.title}
            </Link>
          </h3>
          <ToolTypeBadge type={tool.type} />
        </div>
        {tool.description && (
          <p className="line-clamp-2 text-sm text-muted">{tool.description}</p>
        )}
        {window && <p className="text-xs text-muted">{window}</p>}
        <div className="relative z-10 mt-auto pt-1">
          <ToolCardActions
            whatsappUrl={whatsappUrl}
            sharePath={detailHref}
            shareTitle={tool.title}
            // Short and warm: the rich link preview (the OG card) carries the visuals, so the
            // text just adds a human nudge above it.
            shareText={`✨ ${tool.title} — apoyá a ${tool.schoolName} en escuelaplace 💙`}
          />
        </div>
      </div>
    </article>
  );
}
