/**
 * Project card for the school's public "Proyectos" section (server component). Shows the
 * cover, title, a short description, the funding progress bar and the closed-state badge,
 * and links to the project detail page where the "Financiar" CTA lives. The whole card is
 * a link so the tap target is the full surface.
 */
import Image from "next/image";
import Link from "next/link";
import { projectGoal } from "@/lib/firestore";
import type { ProjectDoc } from "@/types";
import { ProjectProgress } from "./ProjectProgress";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

export function ProjectCard({ project }: { project: ProjectDoc }) {
  const goal = projectGoal(project.stages);

  return (
    <Link
      href={`/school/${project.schoolId}/project/${project.id}`}
      // Elevated calm-depth card: a soft hairline ring + shadow that lifts on hover and dips
      // slightly on press (active:scale) so a tap reads as native.
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-[0.99] active:shadow-md"
    >
      <div className="relative aspect-[3/2] w-full bg-brand-tint">
        {project.coverUrl ? (
          <Image
            src={project.coverUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
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
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-foreground group-hover:text-brand-darker">
            {project.title}
          </h3>
          <ProjectStatusBadge status={project.status} />
        </div>
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted">
            {project.description}
          </p>
        )}
        <div className="mt-auto">
          <ProjectProgress
            raised={project.raised}
            goal={goal}
            currency={project.currency}
            contributorsCount={project.contributorsCount}
            compact
          />
        </div>
      </div>
    </Link>
  );
}
