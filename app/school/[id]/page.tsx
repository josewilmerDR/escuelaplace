import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/business/BusinessCard";
import { PhotoGallery } from "@/components/business/PhotoGallery";
import { SectionTabs } from "@/components/business/SectionTabs";
import { DonorWall } from "@/components/donors/DonorWall";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SchoolManageBar } from "@/components/school/SchoolManageBar";
import {
  ClockIcon,
  FlagIcon,
  HeartIcon,
  MapPinIcon,
  UsersIcon,
  VerifiedIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { buildDirectionsUrl } from "@/lib/contact";
import {
  averageConfirmationTimeMs,
  countRecentUniqueSupporters,
  getBusinessesBySchool,
  getProjectsBySchool,
  getSchoolById,
  getSchoolDonorWall,
  getSubscriptionsBySchool,
  toBusinessCardData,
} from "@/lib/firestore";
import { formatApproxDuration } from "@/lib/format";
import { locationParts } from "@/lib/location";
import type { SchoolDoc } from "@/types";

/**
 * Public school page: /school/[id]
 * SSR for SEO. Laid out like the business profile (FB-page style): wide cover, circular
 * avatar overlapping it, name + verified badge, a prominent "Donar" CTA and section tabs
 * in a white header card, then Información / Fotos / Comercios / Muro cards on a gray
 * canvas. Public support metrics are COUNTS only (unique supporters in the last 30
 * days), never amounts. Sensitive data (payment methods) lives in a private
 * subcollection and is NOT read here — the donate flow reveals it only for verified
 * schools.
 */

interface Props {
  params: Promise<{ id: string }>;
}

/** The page column is max-w-4xl (896px) minus px-6 — lets next/image pick the size. */
const COVER_SIZES = "(min-width: 896px) 848px, 100vw";

/** Cover slot priority: explicit cover, first gallery photo, profile photo. */
function coverOf(school: SchoolDoc): string | undefined {
  return school.coverUrl ?? school.photos?.[0] ?? school.photoUrl;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) return { title: "Escuela no encontrada" };
  // og:image drives the share preview on WhatsApp — the platform's main share channel.
  const image = coverOf(school);
  return {
    title: school.name,
    description: school.description,
    openGraph: {
      title: school.name,
      description: school.description,
      type: "website",
      ...(image && { images: [image] }),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
    },
  };
}

export default async function SchoolPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const [businesses, wall, subscriptions, allProjects] = await Promise.all([
    getBusinessesBySchool(id),
    getSchoolDonorWall(id),
    getSubscriptionsBySchool(id),
    getProjectsBySchool(id),
  ]);
  const cards = businesses.map(toBusinessCardData);
  // Cancelled projects are dropped from the public profile; active ones lead and
  // completed ones stay as a track record.
  const projects = allProjects
    .filter((p) => p.status !== "cancelled")
    .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));
  const hasProjects = projects.length > 0;
  const recentSupporters = countRecentUniqueSupporters(subscriptions);
  // Responsiveness signal: average registration→confirmation time of the last 10
  // confirmed donations. null (no chip) until the first confirmation.
  const confirmationTimeMs = averageConfirmationTimeMs(subscriptions);
  const hasWall = wall.recognized.length > 0 || wall.anonymousCount > 0;

  const coverImage = coverOf(school);
  const gallery = school.photos ?? [];
  const initial = school.name.charAt(0).toUpperCase();
  // Where the school is, in words: the visitor must not need to open Maps just to find
  // out the locality. Empty/missing admin levels are filtered by the helper.
  const placeParts = locationParts(school.location);
  const directionsUrl = school.location?.geopoint
    ? buildDirectionsUrl(
        school.location.geopoint.latitude,
        school.location.geopoint.longitude,
      )
    : null;
  // Self-administered pages: anything not admin-approved carries the unverified banner
  // (the donate flow independently hides the payment methods for these — see
  // getVerifiedSchoolPaymentMethods).
  const unverified = school.verificationStatus !== "verified";

  // School structured data: the page is the community's canonical SEO entity.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    description: school.description,
    url: `https://escuelaplace.com/school/${id}`,
    ...(coverImage ? { image: coverImage } : {}),
    ...(school.location
      ? {
          address: {
            "@type": "PostalAddress",
            ...(school.location.admin2
              ? { addressLocality: school.location.admin2 }
              : {}),
            ...(school.location.admin1
              ? { addressRegion: school.location.admin1 }
              : {}),
            ...(school.location.country
              ? { addressCountry: school.location.country }
              : {}),
          },
          ...(school.location.geopoint
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: school.location.geopoint.latitude,
                  longitude: school.location.geopoint.longitude,
                },
              }
            : {}),
        }
      : {}),
  };

  return (
    <>
      {/* Gray canvas behind white cards — the FB-page backdrop. */}
      <div className="min-h-screen bg-surface">
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {/* "<" escaped so owner-controlled text can't close the script tag. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
            }}
          />

          {/* ── Header card: cover + avatar + identity + CTA + tabs ─────────────── */}
          <header className="overflow-hidden rounded-2xl border border-border bg-white">
            {/* Cover fallback ladder: cover/gallery photo → profile photo contained on
                tint → big initial. Wider than 16:9 on desktop — FB covers are short
                bands. */}
            <div className="relative aspect-video w-full bg-brand-tint sm:aspect-[5/2]">
              {coverImage && coverImage !== school.photoUrl ? (
                <Image
                  src={coverImage}
                  alt=""
                  fill
                  priority
                  sizes={COVER_SIZES}
                  className="object-cover"
                />
              ) : school.photoUrl ? (
                <Image
                  src={school.photoUrl}
                  alt=""
                  fill
                  priority
                  sizes={COVER_SIZES}
                  className="object-contain p-8"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-full items-center justify-center text-7xl font-bold text-brand-darker/40"
                >
                  {initial}
                </span>
              )}
            </div>

            <div className="px-5 pb-4 sm:px-8">
              {/* Centered avatar-over-cover on mobile, avatar-left row on desktop. */}
              <div className="flex flex-col items-center sm:flex-row sm:items-end sm:gap-5">
                {/* relative z-10: the cover's fill image is absolutely positioned and
                    would otherwise paint over the avatar's overlapping half. */}
                <div className="relative z-10 -mt-14 shrink-0 sm:-mt-16">
                  {school.photoUrl ? (
                    <Image
                      src={school.photoUrl}
                      alt=""
                      width={128}
                      height={128}
                      className="h-28 w-28 rounded-full border border-border bg-white object-cover ring-4 ring-white sm:h-32 sm:w-32"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-tint text-4xl font-bold text-brand-darker ring-4 ring-white sm:h-32 sm:w-32"
                    >
                      {initial}
                    </span>
                  )}
                </div>

                <div className="mt-3 min-w-0 text-center sm:mt-0 sm:flex-1 sm:pb-1 sm:text-left">
                  <h1 className="flex flex-wrap items-center justify-center gap-2 text-3xl font-bold sm:justify-start">
                    {school.name}
                    {school.verified && (
                      <>
                        <VerifiedIcon
                          className="h-6 w-6 shrink-0 text-brand"
                          title="Escuela verificada"
                        />
                        <span className="sr-only">Escuela verificada</span>
                      </>
                    )}
                  </h1>
                  {placeParts.length > 0 && (
                    <p className="mt-1 text-sm text-muted">
                      {placeParts.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* Trust chips: recent distinct supporters (a count, never an amount)
                  and how fast the board typically confirms donations. Both hidden
                  when there is no data yet — an empty signal on the school's own
                  page reads as a warning, not an invitation. */}
              {(recentSupporters > 0 || confirmationTimeMs !== null) && (
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {recentSupporters > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-800 ring-1 ring-inset ring-green-200">
                      <HeartIcon className="h-4 w-4" />
                      {recentSupporters === 1
                        ? "1 persona o comercio la apoyó en los últimos 30 días"
                        : `${recentSupporters} personas y comercios la apoyaron en los últimos 30 días`}
                    </span>
                  )}
                  {confirmationTimeMs !== null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800 ring-1 ring-inset ring-sky-200">
                      <ClockIcon className="h-4 w-4" />
                      Normalmente confirma las donaciones en{" "}
                      {formatApproxDuration(confirmationTimeMs)}
                    </span>
                  )}
                </div>
              )}

              {/* Primary CTA: the whole platform exists so this button gets pressed.
                  Donating requires sign-in (the panel asks for it); the platform never
                  touches the money. */}
              <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <Link
                  href={`/panel/donate?schoolId=${id}`}
                  className="btn btn-primary justify-center px-8 py-3 text-base font-semibold"
                >
                  <HeartIcon className="mr-2 h-5 w-5" />
                  Donar a esta escuela
                </Link>
                {hasProjects && (
                  <a href="#proyectos" className="btn btn-outline justify-center">
                    <FlagIcon className="mr-2 h-5 w-5" />
                    Ver proyectos
                  </a>
                )}
                {directionsUrl && (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline justify-center"
                  >
                    <MapPinIcon className="mr-2 h-5 w-5" />
                    Cómo llegar
                  </a>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-muted sm:text-left">
                Tu aporte va directo a la escuela por los medios de pago que
                ella misma publica; la plataforma nunca toca el dinero.
              </p>

              {/* Edit/queue shortcuts — only the page's managers see this. */}
              <SchoolManageBar
                schoolId={id}
                ownerId={school.ownerId}
                editorIds={school.editorIds}
              />

              {/* Section tabs (anchors) with scroll-spy. Only sections that exist. */}
              <SectionTabs
                sections={[
                  { id: "informacion", label: "Información" },
                  ...(hasProjects
                    ? [{ id: "proyectos", label: "Proyectos" }]
                    : []),
                  ...(gallery.length > 0
                    ? [{ id: "fotos", label: "Fotos" }]
                    : []),
                  { id: "comercios", label: "Comercios" },
                  ...(hasWall
                    ? [{ id: "muro", label: "Agradecimientos" }]
                    : []),
                ]}
              />
            </div>
          </header>

          {unverified && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">Datos sin verificar.</span> La
                información de esta escuela todavía no fue verificada por el
                equipo de escuelaplace; sus métodos de pago no se muestran
                hasta entonces.
              </p>
            </div>
          )}

          {/* ── Información (FB's intro card) ───────────────────────────────────── */}
          <section
            id="informacion"
            className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
          >
            <h2 className="text-xl font-semibold">Información</h2>
            {/* pre-line: the description is captured in a textarea — keep its line
                breaks. */}
            <p className="mt-3 whitespace-pre-line text-gray-700">
              {school.description}
            </p>

            <ul className="mt-4 space-y-3 text-sm text-slate-600">
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
          </section>

          {hasProjects && (
            <section
              id="proyectos"
              className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
            >
              <h2 className="text-xl font-semibold">
                Proyectos ({projects.length})
              </h2>
              <p className="mt-1 text-sm text-muted">
                Metas concretas de la escuela. Tu aporte va directo a ella; la
                plataforma nunca toca el dinero y la escuela confirma cada
                colaboración.
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </section>
          )}

          {gallery.length > 0 && (
            <section
              id="fotos"
              aria-label="Fotos de la escuela"
              className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
            >
              <h2 className="text-xl font-semibold">Fotos</h2>
              {/* Client island: the grid crops to squares, so the lightbox is the
                  only way to see the full photo. */}
              <PhotoGallery photos={gallery} businessName={school.name} />
            </section>
          )}

          {/* ── Businesses of the community ─────────────────────────────────────── */}
          <section
            id="comercios"
            className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
          >
            <h2 className="text-xl font-semibold">
              Comercios de su comunidad ({cards.length})
            </h2>

            {cards.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                Todavía no hay comercios vinculados a esta escuela.
              </p>
            ) : (
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((business) => (
                  <BusinessCard key={business.id} business={business} />
                ))}
              </div>
            )}
          </section>

          {hasWall && <DonorWall school={school} wall={wall} />}
        </main>
      </div>
    </>
  );
}
