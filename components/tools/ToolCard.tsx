import Image from "next/image";
import Link from "next/link";
import { ToolCardActions } from "@/components/tools/ToolCardActions";
import { toolBuyHref, toolBuyLabel, toolTypeMeta } from "@/lib/tools/registry";
import { toolContactPhone, toolWindowLabel } from "@/lib/firestore";
import { buildWhatsAppLink } from "@/lib/contact";
import { CARD_COVER_ASPECT, FEED_COVER_SIZES } from "@/lib/layout";
import type { ToolDoc } from "@/types";

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
  // Buyable kinds (rifa/bingo/venta) get an explicit "Comprar" CTA. Bingo (quantity only, no
  // per-cartón pick) goes straight to the order/payment page; rifa/venta need their in-page
  // selection first, so they jump to the detail page's buy section. Either destination re-checks
  // the gating (verified school + availability). Other kinds show only "Consultar"/"Compartir".
  const buyLabel = toolBuyLabel(tool.type);
  const buyHref = toolBuyHref(tool.type, {
    schoolId: tool.schoolId,
    toolId: tool.id,
    detailHref,
  });

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
        {/* Type chip overlaid on the cover (Bingo, Rifa, Visita guiada…) so the activity kind
            reads at a glance. The white-backed chip + icon stays legible over any photo;
            pointer-events-none lets the card's stretched link stay clickable underneath it. */}
        <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-darker shadow-sm ring-1 ring-black/5 backdrop-blur-sm">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {toolTypeMeta(tool.type).label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
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
        {tool.description && (
          <p className="line-clamp-2 text-sm text-muted">{tool.description}</p>
        )}
        {window && <p className="text-xs text-muted">{window}</p>}
        <div className="relative z-10 mt-auto flex flex-col gap-2 pt-1">
          {buyLabel && buyHref && (
            <Link
              href={buyHref}
              className="btn btn-primary w-full justify-center"
            >
              {buyLabel}
            </Link>
          )}
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
