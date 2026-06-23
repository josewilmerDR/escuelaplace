/**
 * Project card for the school's public surfaces (server component). Shows the cover, title, a
 * short description, the funding progress bar and the closed-state badge. The cover/title/body
 * are a STRETCHED LINK to the project detail page (an ::after overlay covering the whole card),
 * so the full surface is the tap target.
 *
 * On the home feed (`showActions`) it also renders a footer mirroring ToolCard: "Consultar" — a
 * prefilled WhatsApp chat on the school's board phone, shown only when a number resolves — and
 * "Ver proyecto", an explicit CTA to the detail page. Those buttons sit above the stretched link
 * (relative z-10) so they stay independently clickable. Both are plain links, so this stays a
 * server component.
 */
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { FlagIcon, WhatsAppIcon } from "@/components/ui/icons";
import { buildWhatsAppLink } from "@/lib/contact";
import { CARD_COVER_ASPECT } from "@/lib/layout";
import { projectGoal } from "@/lib/firestore";
import type { ProjectDoc } from "@/types";
import { ProjectProgress } from "./ProjectProgress";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

export function ProjectCard({
  project,
  coverSizes = "(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw",
  showActions = false,
  boardPhone,
}: {
  project: ProjectDoc;
  /**
   * Cover `sizes`. Defaults to the 3-column grid hint (the "Proyectos" tab and the home
   * carousel); the single-column school activity feed passes FEED_COVER_SIZES so the wider
   * full-column cover isn't upscaled from a grid-sized source.
   */
  coverSizes?: string;
  /**
   * Render the home-feed action footer ("Consultar" + "Ver proyecto"). Off on the school's own
   * surfaces, where the whole card already links to the project so the buttons would be redundant.
   */
  showActions?: boolean;
  /**
   * The school's board phone — the WhatsApp number behind "Consultar" (a project carries no
   * contact of its own). Omitted ⇒ no dialable number ⇒ no "Consultar" button.
   */
  boardPhone?: string;
}) {
  const goal = projectGoal(project.stages);
  const detailHref = `/school/${project.schoolId}/project/${project.id}`;

  // "Consultar" opens a prefilled chat on the school's board phone; buildWhatsAppLink normalizes
  // the number and returns null when it can't be dialed, so the button is hidden rather than dead.
  const whatsappUrl =
    showActions && boardPhone
      ? buildWhatsAppLink(
          boardPhone,
          `¡Hola! Vi el proyecto "${project.title}" de ${project.schoolName} en escuelaplace y quiero hacer una consulta.`,
        )
      : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <div className={`relative w-full bg-brand-tint ${CARD_COVER_ASPECT}`}>
        {project.coverUrl ? (
          <Image
            src={project.coverUrl}
            alt=""
            fill
            sizes={coverSizes}
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-full items-center justify-center text-4xl font-bold text-brand-darker/30"
          >
            {project.title.charAt(0).toUpperCase()}
          </span>
        )}
        {/* Type pill, mirroring the tool cards' kind pill so the activity reads at a glance —
            but a SOLID brand chip (vs their white one) so a fundraising project stands apart
            from a rifa/bingo/venta. Same flag motif the SchoolCard uses to flag active
            projects. pointer-events-none keeps the card's stretched link clickable. */}
        <Badge
          tone="brand"
          className="pointer-events-none absolute left-3 top-3 z-10 gap-1.5 shadow-sm"
        >
          <FlagIcon className="h-3.5 w-3.5" aria-hidden />
          Proyecto
        </Badge>
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
              {project.title}
            </Link>
          </h3>
          <ProjectStatusBadge status={project.status} />
        </div>
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted">
            {project.description}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-3">
          <ProjectProgress
            raised={project.raised}
            goal={goal}
            currency={project.currency}
            contributorsCount={project.contributorsCount}
            compact
          />
          {showActions && (
            <div className="relative z-10 flex gap-2 pt-1">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  // WhatsApp-flavored green, darkened to emerald-700 for AA contrast (see globals.css).
                  className="btn flex-1 justify-center bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  <WhatsAppIcon className="mr-1.5 h-4 w-4" />
                  Consultar
                </a>
              )}
              <Link
                href={detailHref}
                className="btn btn-primary flex-1 justify-center"
              >
                Ver proyecto
              </Link>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
