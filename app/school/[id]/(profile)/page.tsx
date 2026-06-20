import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DonorWallManagerHint } from "@/components/donors/DonorWallManagerHint";
import { ToolCard } from "@/components/tools/ToolCard";
import { Section } from "@/components/ui/Section";
import {
  getSchoolById,
  getSchoolDonorWall,
  getToolsBySchool,
  publicTools,
  schoolCover,
} from "@/lib/firestore";

/**
 * School profile index (/school/[id]) — the "Principal" landing tab: the school's live
 * "Herramientas" (rifas/ventas/etc.), the timely calls to action it wants seen first. The
 * school's identity (description, locality, board contact) now lives in its own stable
 * "Información" tab so it isn't pushed down as activity accumulates. The shared (profile)
 * layout renders the header, tabs and unverified banner; this page renders only the body.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) return { title: "Escuela no encontrada" };
  // og:image drives the share preview on WhatsApp — the platform's main share channel.
  const image = schoolCover(school);
  return {
    title: school.name,
    ...(school.description && { description: school.description }),
    openGraph: {
      title: school.name,
      ...(school.description && { description: school.description }),
      type: "website",
      ...(image && { images: [image] }),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
    },
  };
}

export default async function SchoolLandingPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  // Managers should always be able to reach the donor-wall setup; when the wall is empty
  // there is no "Agradecimientos" tab, so the nudge lives here on the school's landing tab.
  // Active "Herramientas" (rifas/ventas/etc.) lead the landing — they are the timely calls to
  // action the school wants seen first; both reads degrade to empty on a transient failure.
  const [wall, tools] = await Promise.all([
    getSchoolDonorWall(id).catch(() => ({ recognized: [], anonymousCount: 0 })),
    getToolsBySchool(id).catch(() => []),
  ]);
  const hasWall = wall.recognized.length > 0 || wall.anonymousCount > 0;
  const liveTools = publicTools(tools);

  return (
    // The "Principal" tab is the school's activity FEED: a single centered column of stacked
    // post cards (Facebook-style), narrower than the full-width header above. Wrapping the whole
    // body keeps the empty state and the manager hint aligned to the same column.
    <div className="mx-auto max-w-2xl">
      {liveTools.length > 0 ? (
        // Un-nested from a Section card on purpose: the posts float as their own cards on the
        // gray canvas (the feed look), led by a plain section heading rather than a card title.
        <section id="actividades" className="mt-4 scroll-mt-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Actividades de la escuela
          </h2>
          <p className="mt-1 text-sm text-muted">
            Rifas, ventas y otras actividades que la escuela está organizando.
          </p>
          <div className="mt-5 flex flex-col gap-5">
            {liveTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                boardPhone={school.boardContact?.phone}
              />
            ))}
          </div>
        </section>
      ) : (
        // No live activity yet: rather than an empty landing, point visitors to the school's
        // identity and the ways they can help.
        <Section id="actividades" title="Actividades de la escuela">
          <p className="mt-3 text-muted">
            Esta escuela todavía no tiene actividades en curso. Conocé más en{" "}
            <Link
              href={`/school/${id}/info`}
              className="font-medium text-brand-darker hover:underline"
            >
              Información
            </Link>{" "}
            o apoyala con una donación.
          </p>
        </Section>
      )}

      {!hasWall && (
        <DonorWallManagerHint
          schoolId={id}
          ownerId={school.ownerId}
          editorIds={school.editorIds}
        />
      )}
    </div>
  );
}
