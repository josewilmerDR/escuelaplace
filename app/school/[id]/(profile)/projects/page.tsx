import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { FlagIcon } from "@/components/ui/icons";
import { getProjectsBySchool, getSchoolById } from "@/lib/firestore";

/**
 * School profile "Proyectos" section at /school/[id]/projects. Cancelled projects are
 * dropped; active ones lead and completed ones stay as a track record.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  return {
    title: school ? `Proyectos · ${school.name}` : "Escuela no encontrada",
  };
}

export default async function SchoolProjectsPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const allProjects = await getProjectsBySchool(id).catch(() => []);
  const projects = allProjects
    .filter((p) => p.status !== "cancelled")
    .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));

  return (
    <Section
      id="proyectos"
      title={`Proyectos (${projects.length})`}
      description="Metas concretas de la escuela. La escuela confirma cada colaboración."
    >
      {projects.length === 0 ? (
        <EmptyState
          icon={<FlagIcon className="h-7 w-7" />}
          title="Todavía no hay proyectos"
          description="Esta escuela aún no publicó metas concretas."
        />
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </Section>
  );
}
