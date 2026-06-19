import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackedLink } from "@/components/business/TrackedLink";
import { Chip } from "@/components/ui/Chip";
import { Section } from "@/components/ui/Section";
import {
  ClockIcon,
  GlobeIcon,
  MapPinIcon,
  PhoneIcon,
} from "@/components/ui/icons";
import {
  buildDirectionsUrl,
  buildPhoneUrl,
  buildWebsiteUrl,
  formatPhoneDisplay,
  normalizePhoneInternational,
} from "@/lib/contact";
import { getBusinessBySlug, splitBusinessPhotos } from "@/lib/firestore";
import { locationParts } from "@/lib/location";

/**
 * Business profile index (/business/[slug]) — the "Información" section: description,
 * categories, locality, hours, phone and website. The shared (profile) layout renders the
 * header, tabs and discount banner; this page renders the section body and the page's
 * LocalBusiness JSON-LD (the canonical SEO entity for the catalog).
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) return { title: "Comercio no encontrado" };
  // og:image drives the share preview on WhatsApp — the platform's main share channel.
  const { cover, gallery } = splitBusinessPhotos(business);
  const image = cover ?? gallery[0] ?? business.logoUrl;
  return {
    title: business.name,
    description: business.description,
    openGraph: {
      title: business.name,
      description: business.description,
      type: "website",
      ...(image && { images: [image] }),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
    },
  };
}

export default async function BusinessInfoPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const { cover, gallery } = splitBusinessPhotos(business);
  const coverImage = cover ?? gallery[0];
  const shareImage = coverImage ?? business.logoUrl;
  const placeParts = locationParts(business.location);
  const categoryChips = (business.categories ?? [])
    .map((id, i) => ({ id, name: business.categoryNames?.[i] }))
    .filter((c): c is { id: string; name: string } => Boolean(c.name));
  const stats = business.reviewStats ?? { count: 0, average: 0 };

  // Phone/website for the Información list — same normalization as the action buttons, so
  // both render (or hide) together.
  const phoneUrl = business.contact?.phone
    ? buildPhoneUrl(business.contact.phone)
    : null;
  const phoneDisplay = business.contact?.phone
    ? formatPhoneDisplay(business.contact.phone)
    : null;
  const websiteUrl = business.contact?.web
    ? buildWebsiteUrl(business.contact.web)
    : null;
  const directionsUrl = business.location?.geopoint
    ? buildDirectionsUrl(
        business.location.geopoint.latitude,
        business.location.geopoint.longitude,
      )
    : null;

  // LocalBusiness structured data: the profile is the catalog's canonical SEO entity, and
  // aggregateRating is what puts review stars on the Google result.
  const phone = business.contact?.phone
    ? normalizePhoneInternational(business.contact.phone)
    : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
    description: business.description,
    url: `https://escuelaplace.com/business/${business.slug}`,
    ...(shareImage ? { image: shareImage } : {}),
    ...(phone ? { telephone: `+${phone}` } : {}),
    ...(business.location
      ? {
          address: {
            "@type": "PostalAddress",
            ...(business.location.address
              ? { streetAddress: business.location.address }
              : {}),
            ...(business.location.admin2
              ? { addressLocality: business.location.admin2 }
              : {}),
            ...(business.location.admin1
              ? { addressRegion: business.location.admin1 }
              : {}),
            ...(business.location.country
              ? { addressCountry: business.location.country }
              : {}),
          },
          ...(business.location.geopoint
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: business.location.geopoint.latitude,
                  longitude: business.location.geopoint.longitude,
                },
              }
            : {}),
        }
      : {}),
    ...(stats.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: stats.average,
            reviewCount: stats.count,
          },
        }
      : {}),
  };

  return (
    <>
      {/* "<" escaped so merchant-controlled text can't close the script tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <Section id="informacion" title="Información">
        {/* pre-line: the description is captured in a textarea — keep its line breaks. */}
        {business.description && (
          <p className="mt-3 whitespace-pre-line text-muted">
            {business.description}
          </p>
        )}

        {/* Category chips right after the description (not a trailing block of their own):
            with sparse data the card otherwise reads half-empty. */}
        {categoryChips.length > 0 && (
          <nav aria-label="Categorías" className="mt-3 flex flex-wrap gap-2">
            {categoryChips.map((c) => (
              <Chip key={c.id} href={`/category/${c.id}`}>
                {c.name}
              </Chip>
            ))}
          </nav>
        )}

        {(placeParts.length > 0 ||
          business.hours ||
          (phoneUrl && phoneDisplay) ||
          websiteUrl) && (
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
            {business.hours && (
              <li className="flex items-start gap-3">
                <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                {/* pre-line: hours are free text the owner may write across lines. */}
                <span className="whitespace-pre-line">{business.hours}</span>
              </li>
            )}
            {/* Phone and website also live in the action buttons; repeating them here as
                readable text is the FB intro-card pattern. Same tracked channels as the
                buttons, so the funnel metrics stay coherent. */}
            {phoneUrl && phoneDisplay && (
              <li className="flex items-start gap-3">
                <PhoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                <TrackedLink
                  businessId={business.id}
                  channel="phone"
                  href={phoneUrl}
                  external={false}
                  className="hover:underline"
                >
                  {phoneDisplay}
                </TrackedLink>
              </li>
            )}
            {websiteUrl && (
              <li className="flex items-start gap-3">
                <GlobeIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                <TrackedLink
                  businessId={business.id}
                  channel="website"
                  href={websiteUrl}
                  external
                  className="break-all hover:underline"
                >
                  {websiteUrl.replace(/^https?:\/\//, "")}
                </TrackedLink>
              </li>
            )}
          </ul>
        )}
      </Section>
    </>
  );
}
