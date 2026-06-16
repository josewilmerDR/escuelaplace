import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectManageBar } from "@/components/projects/ProjectManageBar";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStageItem } from "@/components/projects/ProjectStageItem";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import {
  PLATFORM_MONEY_DISCLAIMER_TEXT,
  UnverifiedSchoolNotice,
} from "@/components/school/UnverifiedSchoolNotice";
import { cardClass } from "@/components/ui/Card";
import { FlagIcon, WarningIcon } from "@/components/ui/icons";
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
  // Metadata uses the denormalized project.schoolName (the school doc isn't fetched here);
  // the rendered page below uses the fresh school.name instead.
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
  // Same verification gate the sibling school page shows, independent of the project's own
  // status: an unverified school's data (and payment methods) aren't shown until approval.
  const unverified = school.verificationStatus !== "verified";

  // Sibling projects to navigate to: drop the current one and cancelled ones. Compute the
  // eligible list once so we can both cap the cards at 3 and tell whether there are more.
  const eligible = siblings.filter(
    (p) => p.id !== pid && p.status !== "cancelled",
  );
  const otherProjects = eligible.slice(0, 3);
  const hasMoreProjects = eligible.length > 3;

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
    <PageContainer variant="detail">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="text-sm">
        {/* Roomier tap target without changing the link's visible size. */}
        <span className="inline-flex py-2 -my-2">
          <BackLink href={`/school/${id}`}>{school.name}</BackLink>
        </span>
      </div>

      {/* Edit/queue shortcuts — only the page's managers see this. Client island that
          renders null for visitors, so it never shifts the SSR layout. */}
      <ProjectManageBar
        schoolId={id}
        projectId={pid}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {unverified && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warning-tint p-4 text-sm text-warning ring-1 ring-warning/10">
          <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <span className="font-medium">Datos sin verificar.</span> La
            información de esta escuela todavía no fue verificada por el equipo
            de escuelaplace; sus métodos de pago no se muestran hasta entonces.
          </p>
        </div>
      )}

      <article className={`mt-3 overflow-hidden ${cardClass("elevated", false)}`}>
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

          <div className={`mt-6 ${cardClass("inset")}`}>
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
                    Para registrar tu aporte iniciás sesión con Google.{" "}
                    {PLATFORM_MONEY_DISCLAIMER_TEXT}
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
                  {/* UnverifiedSchoolNotice is a hard stop ("vas a poder aportar en
                      cuanto la verifiquemos"); no money disclaimer here, since it would
                      contradict the hard stop by implying contributing is possible now. */}
                  <UnverifiedSchoolNotice />
                </div>
              )}
            </div>
          </div>

          {/* ── Stages ──────────────────────────────────────────────────── */}
          {/* A project without stages has no goal to display — skip the section
              entirely instead of showing "Etapas (0)" with a ₡0 goal line. */}
          {project.stages.length > 0 && (
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
                  <ProjectStageItem
                    key={i}
                    stage={stage}
                    index={i}
                    currency={project.currency}
                    projectTitle={project.title}
                  />
                ))}
              </ol>
            </section>
          )}

          {otherProjects.length > 0 && (
            <section className="mt-8">
              {/* Cap the cards at 3; when more siblings exist, offer the full list on
                  the school page instead of silently truncating. */}
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Otros proyectos de esta escuela
                </h2>
                {hasMoreProjects && (
                  <Link
                    href={`/school/${id}#proyectos`}
                    className="text-sm font-medium text-brand-darker hover:underline"
                  >
                    Ver todos
                  </Link>
                )}
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {otherProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </PageContainer>
  );
}
