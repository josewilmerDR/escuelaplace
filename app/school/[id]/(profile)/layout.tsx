import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ProfileHeader } from "@/components/layout/ProfileHeader";
import { ProfileTabs } from "@/components/layout/ProfileTabs";
import { PageContainer } from "@/components/layout/PageContainer";
import { ScrollTopOnOpen } from "@/components/layout/ScrollTopOnOpen";
import { DonateHint } from "@/components/school/DonateHint";
import { SchoolManageBar } from "@/components/school/SchoolManageBar";
import { StatChip } from "@/components/ui/StatChip";
import {
  ClockIcon,
  FlagIcon,
  HeartIcon,
  MapPinIcon,
  TagIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { buildDirectionsUrl } from "@/lib/contact";
import { PAGE_COVER_SIZES } from "@/lib/layout";
import {
  averageConfirmationTimeMs,
  countRecentUniqueSupporters,
  getConfirmedSubscriptionsBySchool,
  getProjectsBySchool,
  getSchoolById,
  getSchoolDonorWall,
  getSupportingBusinesses,
  isSchoolVerified,
  schoolCover,
} from "@/lib/firestore";
import { formatApproxDuration } from "@/lib/format";
import { locationParts } from "@/lib/location";

/**
 * Shared chrome for the public school profile (/school/[id] and its section sub-routes).
 * SSR for SEO. Renders the FB-page-style header (wide cover, overlapping avatar, identity,
 * trust chips, donate CTA, manage bar), the route tab strip, the JSON-LD and the
 * unverified banner — then hands the active section to `{children}`. Each section lives at
 * its own URL; this layout stays mounted across tab switches so only the section content
 * swaps. Every read here is wrapped in React cache(), so the section pages re-reading the
 * same data cost no extra Firestore queries.
 *
 * Lives in a `(profile)` route group so it does NOT wrap the sibling public project detail
 * page (/school/[id]/project/[pid]), which keeps its own standalone layout.
 *
 * Public support metrics are COUNTS only (unique supporters in the last 30 days), never
 * amounts. Sensitive data (payment methods) is not read here — the donate flow reveals it
 * only for verified schools.
 */

// ISR safety net: without this the statically-generated school pages stay cached until the
// next deploy, so function-maintained fields (metrics, donor wall) — which the client can't
// revalidate on-demand — would never refresh. 300s mirrors the catalog listings; owner edits
// still refresh instantly via revalidateSchoolCatalog (lib/revalidate.ts).
export const revalidate = 300;

interface Props {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default async function SchoolProfileLayout({ children, params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  // Secondary reads feed the header's CTAs/chips and decide which tabs exist. Each degrades
  // to a safe empty fallback on a transient failure so a flaky read doesn't take down the
  // whole profile. All four are cached(), shared with the section pages below.
  const [supportingBusinesses, wall, confirmedSubs, allProjects] =
    await Promise.all([
      getSupportingBusinesses(id).catch((err) => {
        console.error("school layout: getSupportingBusinesses failed", err);
        return [];
      }),
      getSchoolDonorWall(id).catch((err) => {
        console.error("school layout: getSchoolDonorWall failed", err);
        return { recognized: [], anonymousCount: 0 };
      }),
      getConfirmedSubscriptionsBySchool(id).catch((err) => {
        console.error("school layout: getConfirmedSubscriptionsBySchool failed", err);
        return [];
      }),
      getProjectsBySchool(id).catch((err) => {
        console.error("school layout: getProjectsBySchool failed", err);
        return [];
      }),
    ]);

  const supportingBusinessCount = supportingBusinesses.length;
  const hasProjects = allProjects.some((p) => p.status !== "cancelled");
  const hasWall = wall.recognized.length > 0 || wall.anonymousCount > 0;
  const gallery = school.photos ?? [];

  const recentSupporters = countRecentUniqueSupporters(confirmedSubs);
  const confirmationTimeMs = averageConfirmationTimeMs(confirmedSubs);

  const coverImage = schoolCover(school);
  const initial = school.name.charAt(0).toUpperCase();
  // Cover fallback ladder: a distinct cover photo → the profile photo contained on tint →
  // big initial.
  const coverDescriptor =
    coverImage && coverImage !== school.photoUrl
      ? { src: coverImage, contain: false }
      : school.photoUrl
        ? { src: school.photoUrl, contain: true }
        : undefined;
  const placeParts = locationParts(school.location);
  const directionsUrl = school.location?.geopoint
    ? buildDirectionsUrl(
        school.location.geopoint.latitude,
        school.location.geopoint.longitude,
      )
    : null;
  const unverified = !isSchoolVerified(school);

  // School structured data: the page is the community's canonical SEO entity.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
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

  // Tabs: "Principal" (the activity landing), "Información" (the school's identity) and
  // Comercios always exist; the rest only when they have content. The tab strip is a
  // single-row carousel that scrolls horizontally instead of wrapping, so adding tabs never
  // pushes them to a second line. Routes are English segments; labels are the Spanish UI copy.
  const base = `/school/${id}`;
  const tabs = [
    { href: base, label: "Principal" },
    { href: `${base}/info`, label: "Información" },
    ...(hasProjects ? [{ href: `${base}/projects`, label: "Proyectos" }] : []),
    ...(gallery.length > 0 ? [{ href: `${base}/photos`, label: "Fotos" }] : []),
    { href: `${base}/businesses`, label: "Comercios" },
    ...(hasWall ? [{ href: `${base}/thanks`, label: "Agradecimientos" }] : []),
  ];

  return (
    <PageContainer variant="detail">
      {/* Open on the cover/avatar, not scrolled down to a section — even if the browser restored
          a prior scroll or a client island nudged it. Honors #section deep-links. */}
      <ScrollTopOnOpen dep={id} />

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
        coverOverlay={
          // Manage controls (bell + gear) float on the cover for the page's managers only.
          <SchoolManageBar
            schoolId={id}
            ownerId={school.ownerId}
            editorIds={school.editorIds}
          />
        }
        meta={
          placeParts.length > 0 ? (
            <p className="mt-1 text-sm text-muted">{placeParts.join(", ")}</p>
          ) : null
        }
      >
        {/* Trust chips: recent distinct supporters (a count, never an amount) and how fast
            the board typically confirms donations. Both hidden when there is no data yet —
            an empty signal on the school's own page reads as a warning, not an invitation. */}
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

        {/* Primary CTA: the whole platform exists so this button gets pressed. Donating
            requires sign-in (the panel asks for it); the platform never touches the money.
            While the school is unverified its payment methods stay hidden, so the CTA can't
            complete a donation — it is demoted from a solid primary to an outline button so
            it doesn't promise an action that has no way to finish yet. */}
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
          {/* The no-login support path: buying from the community's businesses. Promote it
              to primary when the school is unverified — donating can't complete then, so this
              is the only real way a buyer can support it. */}
          {supportingBusinessCount > 0 && (
            <Link
              href={`${base}/businesses`}
              className={`btn justify-center ${
                unverified ? "btn-primary" : "btn-outline"
              }`}
            >
              <TagIcon className="mr-2 h-5 w-5" />
              Comprales a quienes la apoyan
            </Link>
          )}
          {hasProjects && (
            <Link href={`${base}/projects`} className="btn btn-outline justify-center">
              <FlagIcon className="mr-2 h-5 w-5" />
              Ver proyectos
            </Link>
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
        <DonateHint unverified={unverified} />

        {/* Section tabs — each is its own route. The manage controls (bell + gear) now float
            on the cover; see ProfileHeader's `coverOverlay` above. */}
        <ProfileTabs tabs={tabs} />
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

      {children}
    </PageContainer>
  );
}
