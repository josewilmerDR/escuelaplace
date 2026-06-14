import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { notFound } from "next/navigation";
import { PhotoGallery } from "@/components/business/PhotoGallery";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { UnverifiedSchoolNotice } from "@/components/school/UnverifiedSchoolNotice";
import { FlagIcon, PaperClipIcon } from "@/components/ui/icons";
import {
  canFundProject,
  getProjectById,
  getProjectsBySchool,
  getSchoolById,
  isGoalReached,
  projectGoal,
} from "@/lib/firestore";
import { PAGE_COVER_SIZES } from "@/lib/layout";
import { formatMoney } from "@/lib/format";
import type { ProjectStage } from "@/types";

/**
 * Public project detail: /school/[id]/project/[pid]
 * SSR for SEO. Shows the project's cover, the funding progress, each cost-justified stage
 * with its photos and quotes, and the "Financiar" CTA. Contributing is gated by school
 * verification (same gate as the payment methods): an unverified school can list projects,
 * but the button only turns on once the team verifies it.
 */

interface Props {
  params: Promise<{ id: string; pid: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, pid } = await params;
  const project = await getProjectById(id, pid);
  if (!project) return { title: "Proyecto no encontrado" };
  return {
    title: `${project.title} · ${project.schoolName}`,
    description: project.description,
    // A cancelled project stays reachable by direct URL but should not be indexed.
    ...(project.status === "cancelled" ? { robots: { index: false } } : {}),
    openGraph: {
      title: project.title,
      description: project.description,
      type: "website",
      ...(project.coverUrl ? { images: [project.coverUrl] } : {}),
    },
    twitter: { card: project.coverUrl ? "summary_large_image" : "summary" },
  };
}

export default async function ProjectPage({ params }: Props) {
  const { id, pid } = await params;
  const [project, school, siblings] = await Promise.all([
    getProjectById(id, pid),
    getSchoolById(id),
    getProjectsBySchool(id),
  ]);
  if (!project || !school) notFound();

  const goal = projectGoal(project.stages);
  const reached = isGoalReached(project.raised, goal);
  const canFund = canFundProject(school, project);

  // Sibling projects to navigate to: drop the current one and cancelled ones, cap at 3.
  const otherProjects = siblings
    .filter((p) => p.id !== pid && p.status !== "cancelled")
    .slice(0, 3);

  // Structured data: the project is a fundraising goal of the school. "<" escaped so
  // owner-controlled text can't close the script tag.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Project",
    name: project.title,
    description: project.description,
    url: `https://escuelaplace.com/school/${id}/project/${pid}`,
    ...(project.coverUrl ? { image: project.coverUrl } : {}),
  };

  return (
    <>
      <div className="min-h-screen bg-surface">
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
            }}
          />

          <p className="text-sm text-muted">
            {/* Roomier tap target without changing the link's visible size. */}
            <span className="inline-flex py-2 -my-2">
              <BackLink href={`/school/${id}`}>{project.schoolName}</BackLink>
            </span>
          </p>

          <article className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="relative aspect-video w-full bg-brand-tint sm:aspect-[5/2]">
              {project.coverUrl ? (
                <Image
                  src={project.coverUrl}
                  alt=""
                  fill
                  priority
                  sizes={PAGE_COVER_SIZES}
                  className="object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-full items-center justify-center text-7xl font-bold text-brand-darker/30"
                >
                  {project.title.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="p-5 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  {project.title}
                </h1>
                <ProjectStatusBadge status={project.status} />
              </div>

              {project.description && (
                <p className="mt-3 whitespace-pre-line text-muted">
                  {project.description}
                </p>
              )}

              <div className="mt-6 rounded-2xl bg-surface p-5 ring-1 ring-black/5">
                <ProjectProgress
                  raised={project.raised}
                  goal={goal}
                  currency={project.currency}
                  contributorsCount={project.contributorsCount}
                />
                {reached && (
                  <p className="mt-3 text-sm font-medium text-success">
                    ¡Meta alcanzada! Gracias a quienes aportaron.
                  </p>
                )}

                <div className="mt-4">
                  {canFund ? (
                    <div>
                      <Link
                        href={`/panel/fund?schoolId=${id}&projectId=${pid}`}
                        className="btn btn-primary justify-center px-8 py-3 text-base font-semibold"
                      >
                        <FlagIcon className="mr-2 h-5 w-5" />
                        {reached ? "Seguir aportando" : "Financiar este proyecto"}
                      </Link>
                      <p className="mt-2 text-sm text-muted">
                        {reached
                          ? "La escuela sigue recibiendo aportes (en dinero o en especie) por encima de la meta."
                          : "Podés aportar en dinero o donar en especie (bienes o trabajo, como una etapa completa); su valor estimado suma al avance."}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Tu aporte va directo a la escuela por los medios de pago
                        que ella publica; la plataforma nunca toca el dinero y la
                        escuela confirma cada colaboración.
                      </p>
                    </div>
                  ) : project.status !== "active" ? (
                    <p className="text-sm text-muted">
                      Este proyecto está{" "}
                      {project.status === "completed"
                        ? "completado"
                        : "cancelado"}{" "}
                      y ya no recibe aportes.
                    </p>
                  ) : (
                    <div>
                      <UnverifiedSchoolNotice />
                      <p className="mt-2 text-xs text-muted">
                        Tu aporte va directo a la escuela por los medios de pago
                        que ella publica; la plataforma nunca toca el dinero y la
                        escuela confirma cada colaboración.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Stages ──────────────────────────────────────────────────── */}
              <section className="mt-8">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Etapas del proyecto ({project.stages.length})
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Cada etapa justifica su costo. La suma de las etapas es la meta
                  total: {formatMoney(goal, project.currency)}.
                </p>
                <ol className="mt-5 flex flex-col gap-5">
                  {project.stages.map((stage, i) => (
                    <StageItem
                      key={i}
                      stage={stage}
                      index={i}
                      currency={project.currency}
                      projectTitle={project.title}
                    />
                  ))}
                </ol>
              </section>

              {otherProjects.length > 0 && (
                <section className="mt-8">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Otros proyectos de esta escuela
                  </h2>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {otherProjects.map((p) => (
                      <ProjectCard key={p.id} project={p} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </article>
        </main>
      </div>
    </>
  );
}

function StageItem({
  stage,
  index,
  currency,
  projectTitle,
}: {
  stage: ProjectStage;
  index: number;
  currency: string;
  projectTitle: string;
}) {
  return (
    // Inset panel inside the white article card: a soft surface fill + hairline ring
    // reads as a nested block without stacking white-on-white.
    <li className="rounded-xl bg-surface p-4 ring-1 ring-black/5 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">
          {stage.title ? (
            <>
              <span className="text-muted">Etapa {index + 1}.</span>{" "}
              {stage.title}
            </>
          ) : (
            <span className="text-muted">Etapa {index + 1}</span>
          )}
        </h3>
        {stage.cost > 0 ? (
          <span className="font-semibold text-brand-darker">
            {formatMoney(stage.cost, currency)}
          </span>
        ) : (
          <span className="text-sm text-muted">Sin costo monetario</span>
        )}
      </div>
      {stage.justification && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted">
          {stage.justification}
        </p>
      )}

      {stage.photos && stage.photos.length > 0 && (
        <div className="mt-3">
          <PhotoGallery
            photos={stage.photos}
            businessName={`${projectTitle} — etapa ${index + 1}`}
          />
        </div>
      )}

      {stage.quoteUrls && stage.quoteUrls.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {stage.quoteUrls.map((url, qi) => (
            <li key={qi}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver cotización ${qi + 1} de la etapa ${index + 1} (abre en pestaña nueva)`}
                className="btn btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-sm"
              >
                <PaperClipIcon className="h-4 w-4" />
                Ver cotización
                {stage.quoteUrls!.length > 1 ? ` ${qi + 1}` : ""}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
