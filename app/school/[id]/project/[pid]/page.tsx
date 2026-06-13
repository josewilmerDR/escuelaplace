import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoGallery } from "@/components/business/PhotoGallery";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { getProjectById, getSchoolById, projectGoal } from "@/lib/firestore";
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

const COVER_SIZES = "(min-width: 896px) 848px, 100vw";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, pid } = await params;
  const project = await getProjectById(id, pid);
  if (!project) return { title: "Proyecto no encontrado" };
  return {
    title: `${project.title} · ${project.schoolName}`,
    description: project.description,
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
  const [project, school] = await Promise.all([
    getProjectById(id, pid),
    getSchoolById(id),
  ]);
  if (!project || !school) notFound();

  const goal = projectGoal(project.stages);
  const reached = goal > 0 && project.raised >= goal;
  const verified = school.verificationStatus === "verified";
  const canFund = verified && project.status === "active";

  return (
    <>
      <div className="min-h-screen bg-surface">
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <p className="text-sm text-muted">
            <Link href={`/school/${id}`} className="hover:underline">
              ← {project.schoolName}
            </Link>
          </p>

          <article className="mt-3 overflow-hidden rounded-2xl border border-border bg-white">
            {project.coverUrl && (
              <div className="relative aspect-video w-full bg-brand-tint sm:aspect-[5/2]">
                <Image
                  src={project.coverUrl}
                  alt=""
                  fill
                  priority
                  sizes={COVER_SIZES}
                  className="object-cover"
                />
              </div>
            )}

            <div className="p-5 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold">{project.title}</h1>
                <ProjectStatusBadge status={project.status} />
              </div>

              {project.description && (
                <p className="mt-3 whitespace-pre-line text-muted">
                  {project.description}
                </p>
              )}

              <div className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <ProjectProgress
                  raised={project.raised}
                  goal={goal}
                  currency={project.currency}
                  contributorsCount={project.contributorsCount}
                />
                {reached && (
                  <p className="mt-3 text-sm font-medium text-green-800">
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
                        Financiar este proyecto
                      </Link>
                      <p className="mt-2 text-sm text-muted">
                        Podés aportar en dinero o donar en especie (bienes o
                        trabajo, como una etapa completa); su valor estimado
                        suma al avance.
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
                    <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                      Esta escuela todavía no fue verificada por el equipo de
                      escuelaplace. Vas a poder financiar este proyecto en cuanto
                      se verifique.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Tu aporte va directo a la escuela por los medios de pago que
                    ella publica; la plataforma nunca toca el dinero y la escuela
                    confirma cada colaboración.
                  </p>
                </div>
              </div>

              {/* ── Stages ──────────────────────────────────────────────────── */}
              <section className="mt-8">
                <h2 className="text-xl font-semibold">
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
    <li className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">
          <span className="text-muted">Etapa {index + 1}.</span> {stage.title}
        </h3>
        <span className="font-semibold text-brand-darker">
          {formatMoney(stage.cost, currency)}
        </span>
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
                className="font-medium text-brand-darker hover:underline"
              >
                Ver cotización {stage.quoteUrls!.length > 1 ? qi + 1 : ""}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
