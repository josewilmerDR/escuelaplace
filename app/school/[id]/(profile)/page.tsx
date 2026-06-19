import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DonorWallManagerHint } from "@/components/donors/DonorWallManagerHint";
import { Section } from "@/components/ui/Section";
import { MapPinIcon, UsersIcon } from "@/components/ui/icons";
import { buildDirectionsUrl } from "@/lib/contact";
import {
  getSchoolById,
  getSchoolDonorWall,
  schoolCover,
} from "@/lib/firestore";
import { locationParts } from "@/lib/location";

/**
 * School profile index (/school/[id]) — the "Información" section: description, locality and
 * board contact. The shared (profile) layout renders the header, tabs and unverified banner;
 * this page renders only the section body.
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

export default async function SchoolInfoPage({ params }: Props) {
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
  // The "Información" card holds description, locality and the board contact. With all three
  // empty it would render as an empty card, so it is dropped entirely (the header still
  // carries the name + locality).
  const hasInfo = Boolean(
    school.description || placeParts.length > 0 || school.boardContact?.name,
  );

  // Managers should always be able to reach the donor-wall setup; when the wall is empty
  // there is no "Agradecimientos" tab, so the nudge lives here on the school's landing tab.
  const wall = await getSchoolDonorWall(id).catch(() => ({
    recognized: [],
    anonymousCount: 0,
  }));
  const hasWall = wall.recognized.length > 0 || wall.anonymousCount > 0;

  return (
    <>
      {hasInfo && (
        <Section id="informacion" title="Información">
          {/* pre-line: the description is captured in a textarea — keep its line breaks.
              Guard for "" so an empty description doesn't leave a blank paragraph. */}
          {school.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {school.description}
            </p>
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
                  {school.boardContact.phone && (
                    <> · {school.boardContact.phone}</>
                  )}
                  {school.boardContact.email && (
                    <> · {school.boardContact.email}</>
                  )}
                </span>
              </li>
            )}
          </ul>
        </Section>
      )}

      {!hasWall && (
        <DonorWallManagerHint
          schoolId={id}
          ownerId={school.ownerId}
          editorIds={school.editorIds}
        />
      )}
    </>
  );
}
