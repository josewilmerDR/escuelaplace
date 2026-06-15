import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/business/BusinessCard";
import { PhotoGallery } from "@/components/business/PhotoGallery";
import { SectionTabs } from "@/components/business/SectionTabs";
import { DonorWall } from "@/components/donors/DonorWall";
import { DonorWallManagerHint } from "@/components/donors/DonorWallManagerHint";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProfileHeader } from "@/components/layout/ProfileHeader";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SchoolManageBar } from "@/components/school/SchoolManageBar";
import { Section } from "@/components/ui/Section";
import { StatChip } from "@/components/ui/StatChip";
import {
  ClockIcon,
  FlagIcon,
  HeartIcon,
  MapPinIcon,
  UsersIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { buildDirectionsUrl } from "@/lib/contact";
import { PAGE_COVER_SIZES } from "@/lib/layout";
import {
  averageConfirmationTimeMs,
  countRecentUniqueSupporters,
  getBusinessesBySchool,
  getConfirmedSubscriptionsBySchool,
  getProjectsBySchool,
  getSchoolById,
  getSchoolDonorWall,
  isSchoolVerified,
  schoolCover,
  toBusinessCardData,
} from "@/lib/firestore";
import { formatApproxDuration } from "@/lib/format";
import { locationParts } from "@/lib/location";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) return { title: "Escuela no encontrada" };
  // og:image drives the share preview on WhatsApp — the platform's main share channel.
  const image = schoolCover(school);
  // Omit `description` when empty (same conditional pattern as `image`) so OG/Twitter
  // don't carry an empty field.
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

export default async function SchoolPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  // getSchoolById is the page's core identity: if it throws, the error boundary is the
  // right outcome (we cannot render a school without it). The four SECONDARY reads below
  // feed independent side sections — each degrades to a safe empty fallback on a transient
  // failure so e.g. a flaky donor-wall read doesn't take down the whole profile. The page
  // already renders each section conditionally for empty data (cards.length === 0,
  // hasProjects, hasWall), so empty fallbacks render gracefully.
  const [businesses, wall, confirmedSubs, allProjects] = await Promise.all([
    getBusinessesBySchool(id).catch((err) => {
      console.error("school page: getBusinessesBySchool failed", err);
      return [];
    }),
    getSchoolDonorWall(id).catch((err) => {
      console.error("school page: getSchoolDonorWall failed", err);
      return { recognized: [], anonymousCount: 0 };
    }),
    // Bounded, server-side read of confirmed subscriptions — feeds only the support
    // metrics below (recent unique supporters + average confirmation time), both of
    // which look at confirmed subscriptions alone. The donor wall above uses its own
    // (cached) unbounded read.
    getConfirmedSubscriptionsBySchool(id).catch((err) => {
      console.error("school page: getConfirmedSubscriptionsBySchool failed", err);
      return [];
    }),
    getProjectsBySchool(id).catch((err) => {
      console.error("school page: getProjectsBySchool failed", err);
      return [];
    }),
  ]);
  const cards = businesses.map(toBusinessCardData);
  // Cancelled projects are dropped from the public profile; active ones lead and
  // completed ones stay as a track record.
  const projects = allProjects
    .filter((p) => p.status !== "cancelled")
    .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));
  const hasProjects = projects.length > 0;
  const recentSupporters = countRecentUniqueSupporters(confirmedSubs);
  // Responsiveness signal: average registration→confirmation time of the last 10
  // confirmed donations. null (no chip) until the first confirmation.
  const confirmationTimeMs = averageConfirmationTimeMs(confirmedSubs);
  const hasWall = wall.recognized.length > 0 || wall.anonymousCount > 0;

  const coverImage = schoolCover(school);
  const gallery = school.photos ?? [];
  const initial = school.name.charAt(0).toUpperCase();
  // Cover fallback ladder: a distinct cover photo → the profile photo contained on tint
  // (a portrait stretched to a cover band looks broken) → big initial.
  const coverDescriptor =
    coverImage && coverImage !== school.photoUrl
      ? { src: coverImage, contain: false }
      : school.photoUrl
        ? { src: school.photoUrl, contain: true }
        : undefined;
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
  const unverified = !isSchoolVerified(school);
  // The "Información" card holds description, locality and the board contact. With all
  // three empty it would render as an empty card, so the section (and its tab) are
  // dropped entirely.
  const hasInfo = Boolean(
    school.description || placeParts.length > 0 || school.boardContact?.name,
  );

  // School structured data: the page is the community's canonical SEO entity.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    // Omit `description` when empty (same conditional pattern as `image`).
    ...(school.description ? { description: school.description } : {}),
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
    <PageContainer variant="detail">
      {/* "<" escaped so owner-controlled text can't close the script tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* Header card: cover + avatar + identity + CTA + tabs. */}
      <ProfileHeader
        cover={coverDescriptor}
        coverSizes={PAGE_COVER_SIZES}
        avatar={school.photoUrl || undefined}
        initial={initial}
        name={school.name}
        verified={isSchoolVerified(school)}
        verifiedLabel="Escuela verificada"
        meta={
          placeParts.length > 0 ? (
            <p className="mt-1 text-sm text-muted">{placeParts.join(", ")}</p>
          ) : null
        }
      >
        {/* Trust chips: recent distinct supporters (a count, never an amount)
            and how fast the board typically confirms donations. Both hidden
            when there is no data yet — an empty signal on the school's own
            page reads as a warning, not an invitation. */}
        {(recentSupporters > 0 || confirmationTimeMs !== null) && (
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            {recentSupporters > 0 && (
              <StatChip tone="success" icon={<HeartIcon className="h-4 w-4" />}>
                {recentSupporters === 1
                  ? "1 persona o comercio la apoyó en los últimos 30 días"
                  : `${recentSupporters} personas y comercios la apoyaron en los últimos 30 días`}
              </StatChip>
            )}
            {confirmationTimeMs !== null && (
              <StatChip tone="muted" icon={<ClockIcon className="h-4 w-4" />}>
                Normalmente confirma las donaciones en{" "}
                {formatApproxDuration(confirmationTimeMs)}
              </StatChip>
            )}
          </div>
        )}

        {/* Primary CTA: the whole platform exists so this button gets pressed.
            Donating requires sign-in (the panel asks for it); the platform never
            touches the money. While the school is unverified its payment methods stay
            hidden, so the CTA can't complete a donation — it is demoted from a solid
            primary to an outline button so it doesn't promise an action that has no way
            to finish yet. */}
        <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Link
            href={`/panel/donate?schoolId=${id}`}
            className={`btn justify-center px-8 py-3 text-base font-semibold ${
              unverified ? "btn-outline" : "btn-primary"
            }`}
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
          {unverified
            ? "Podrás donar cuando el equipo de escuelaplace verifique esta escuela y publique sus medios de pago."
            : "Tu aporte va directo a la escuela por los medios de pago que ella misma publica; la plataforma nunca toca el dinero."}
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
            ...(hasInfo ? [{ id: "informacion", label: "Información" }] : []),
            ...(hasProjects ? [{ id: "proyectos", label: "Proyectos" }] : []),
            ...(gallery.length > 0 ? [{ id: "fotos", label: "Fotos" }] : []),
            { id: "comercios", label: "Comercios" },
            ...(hasWall ? [{ id: "muro", label: "Agradecimientos" }] : []),
          ]}
        />
      </ProfileHeader>

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

      {/* Información (FB's intro card). Dropped entirely (with its tab) when the school
          has no description, locality or board contact — an empty card reads as broken. */}
      {hasInfo && (
        <Section id="informacion" title="Información">
          {/* pre-line: the description is captured in a textarea — keep its line
              breaks. Guard for "" so an empty description doesn't leave a blank
              paragraph. */}
          {school.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {school.description}
            </p>
          )}

          <ul className="mt-4 space-y-3 text-sm text-muted">
            {/* The locality also appears in the header meta; surfacing it again here
                (with an actionable "Cómo llegar") is intentional — the Información card
                is the place a reader scans for it, mirroring the sibling business page. */}
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

      {hasProjects && (
        <Section
          id="proyectos"
          title={`Proyectos (${projects.length})`}
          description="Metas concretas de la escuela. La escuela confirma cada colaboración."
        >
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </Section>
      )}

      {gallery.length > 0 && (
        <Section id="fotos" ariaLabel="Fotos de la escuela" title="Fotos">
          {/* Client island: the grid crops to squares, so the lightbox is the
              only way to see the full photo. */}
          <PhotoGallery photos={gallery} businessName={school.name} />
        </Section>
      )}

      {/* Businesses of the community */}
      <Section
        id="comercios"
        title={`Comercios de su comunidad (${cards.length})`}
      >
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
      </Section>

      {hasWall ? (
        <DonorWall school={school} wall={wall} />
      ) : (
        <DonorWallManagerHint
          schoolId={id}
          ownerId={school.ownerId}
          editorIds={school.editorIds}
        />
      )}
    </PageContainer>
  );
}
