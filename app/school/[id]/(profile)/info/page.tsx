import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { MapPinIcon, UsersIcon } from "@/components/ui/icons";
import { buildDirectionsUrl } from "@/lib/contact";
import { getSchoolById, schoolCover } from "@/lib/firestore";
import { locationParts } from "@/lib/location";

/**
 * School "Información" section (/school/[id]/info) — description, locality and board contact.
 * Split out of the landing tab so it has a stable home: as the school accumulates activity
 * the landing feed grows, and burying its identity at the bottom of that feed would hide it.
 * The shared (profile) layout renders the header, tabs and unverified banner; this page
 * renders only the section body.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) return { title: "Escuela no encontrada" };
  const image = schoolCover(school);
  return {
    title: `${school.name} · Información`,
    ...(school.description && { description: school.description }),
    openGraph: {
      title: school.name,
      ...(school.description && { description: school.description }),
      type: "website",
      ...(image && { images: [image] }),
    },
  };
}

export default async function SchoolInfoSectionPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const placeParts = locationParts(school.location);
  const directionsUrl = school.location?.geopoint
    ? buildDirectionsUrl(
        school.location.geopoint.latitude,
        school.location.geopoint.longitude,
      )
    : null;

  return (
    <Section id="informacion" title="Información">
      {/* pre-line: the description is captured in a textarea — keep its line breaks.
          Guard for "" so an empty description doesn't leave a blank paragraph. */}
      {school.description && (
        <p className="mt-3 whitespace-pre-line text-muted">{school.description}</p>
      )}

      <ul className="mt-4 space-y-3 text-sm text-muted">
        {placeParts.length > 0 && (
          <li className="flex items-start gap-3">
            <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            <span>
              {placeParts.join(", ")}
              {directionsUrl && (
                <>
                  {" · "}
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-darker hover:underline"
                  >
                    Cómo llegar
                  </a>
                </>
              )}
            </span>
          </li>
        )}
        {/* The board is the public face of the page: who receives the help. */}
        {school.boardContact?.name && (
          <li className="flex items-start gap-3">
            <UsersIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            <span>
              Comité escolar: {school.boardContact.name}
              {school.boardContact.phone && <> · {school.boardContact.phone}</>}
              {school.boardContact.email && <> · {school.boardContact.email}</>}
            </span>
          </li>
        )}
      </ul>
    </Section>
  );
}
