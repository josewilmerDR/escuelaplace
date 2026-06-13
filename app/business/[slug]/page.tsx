import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactButtons } from "@/components/business/ContactButtons";
import { ManageBar } from "@/components/business/ManageBar";
import { PhotoGallery } from "@/components/business/PhotoGallery";
import { SectionTabs } from "@/components/business/SectionTabs";
import { SupportBadge } from "@/components/business/SupportBadge";
import { TrackPageView } from "@/components/business/TrackPageView";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ReviewList } from "@/components/reviews/ReviewList";
import { TrackedLink } from "@/components/business/TrackedLink";
import {
  ClockIcon,
  GlobeIcon,
  MapPinIcon,
  PhoneIcon,
  TagIcon,
  VerifiedIcon,
} from "@/components/ui/icons";
import {
  buildPhoneUrl,
  buildWebsiteUrl,
  formatPhoneDisplay,
  normalizePhoneInternational,
} from "@/lib/contact";
import {
  getBusinessBySlug,
  getReviewsByBusiness,
  splitBusinessPhotos,
} from "@/lib/firestore";
import { locationParts } from "@/lib/location";

/**
 * Public business page: /business/[slug]
 * SSR for SEO. Laid out like a Facebook business page: wide cover, circular avatar
 * overlapping it, name + verified badge, action buttons and section tabs in a white
 * header card, then Información / Fotos / Reseñas cards on a gray canvas. Writing a
 * review is a client island (<ReviewForm>) that requires Google sign-in.
 *
 * Surfaces follow the app's "calm, depth-not-borders" language: the header and the
 * Información / Fotos / Reseñas blocks are soft elevated cards (hairline ring + shadow,
 * no hard 1px border), tight section titles, generous spacing.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

/** The page column is max-w-4xl (896px) minus px-6 — lets next/image pick the size. */
const COVER_SIZES = "(min-width: 896px) 848px, 100vw";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) return { title: "Comercio no encontrado" };
  // og:image drives the share preview on WhatsApp — the platform's main share channel.
  // Same priority as the profile cover: cover (or first gallery photo), logo fallback.
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

export default async function BusinessPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const reviews = await getReviewsByBusiness(business.id);
  const stats = business.reviewStats ?? { count: 0, average: 0 };
  // Explicit cover vs gallery (legacy-aware — see splitBusinessPhotos). The cover slot
  // falls back to the first gallery photo so landing here from a card (whose thumbnail
  // does the same) is never a visual downgrade.
  const { cover, gallery } = splitBusinessPhotos(business);
  const coverImage = cover ?? gallery[0];
  const initial = business.name.charAt(0).toUpperCase();
  // Where the business is, in words: the buyer must not need to open Maps ("Cómo
  // llegar") just to find out the locality. Empty/missing admin levels are filtered
  // by the helper (legacy docs may lack them entirely).
  const placeParts = locationParts(business.location);
  // categories (ids) and categoryNames are parallel denormalized arrays; zip them and
  // drop entries whose name is missing.
  const categoryChips = (business.categories ?? [])
    .map((id, i) => ({ id, name: business.categoryNames?.[i] }))
    .filter((c): c is { id: string; name: string } => Boolean(c.name));
  // Linking a school is optional ("" = none); both denormalized fields must be set
  // for the "Vinculado a" link to render something clickable.
  const hasSchool = Boolean(business.schoolId && business.schoolName);
  const averageLabel = stats.average.toLocaleString("es-CR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  // Phone/website for the Información list — same normalization as the action
  // buttons, so both render (or hide) together.
  const phoneUrl = business.contact?.phone
    ? buildPhoneUrl(business.contact.phone)
    : null;
  const phoneDisplay = business.contact?.phone
    ? formatPhoneDisplay(business.contact.phone)
    : null;
  const websiteUrl = business.contact?.web
    ? buildWebsiteUrl(business.contact.web)
    : null;

  // LocalBusiness structured data: the profile is the catalog's canonical SEO entity,
  // and aggregateRating is what puts review stars on the Google result.
  const phone = business.contact?.phone
    ? normalizePhoneInternational(business.contact.phone)
    : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
    description: business.description,
    url: `https://escuelaplace.com/business/${business.slug}`,
    ...(coverImage || business.logoUrl
      ? { image: coverImage ?? business.logoUrl }
      : {}),
    ...(phone ? { telephone: `+${phone}` } : {}),
    ...(business.location
      ? {
          // Agnostic admin levels: admin2 ≈ locality, admin1 ≈ region; the country
          // comes from the geocoder (no hardcoded default — the catalog is multi-country).
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
      {/* Gray canvas behind white cards — the FB-page backdrop. */}
      <div className="min-h-screen bg-surface">
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {/* "<" escaped so merchant-controlled text can't close the script tag. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
            }}
          />
          <TrackPageView businessId={business.id} />

          {/* ── Header card: cover + avatar + identity + actions + tabs ─────────── */}
          {/* Depth, not a hard border: a soft hairline ring + small shadow reads as an
              elevated surface floating on the gray canvas. */}
          <header className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {/* Cover: same fallback ladder as BusinessCard (photo → logo contained on
                tint → big initial), so landing here from a card is never a visual
                downgrade. The viewTransitionName pairs with the one the card declares.
                Wider than 16:9 on desktop — FB covers are short bands. */}
            <div
              className="relative aspect-video w-full bg-gradient-to-br from-brand-tint to-white sm:aspect-[5/2]"
              style={{ viewTransitionName: `business-${business.id}` }}
            >
              {coverImage ? (
                <Image
                  src={coverImage}
                  alt=""
                  fill
                  priority
                  sizes={COVER_SIZES}
                  className="object-cover"
                />
              ) : business.logoUrl ? (
                <Image
                  src={business.logoUrl}
                  alt=""
                  fill
                  priority
                  sizes={COVER_SIZES}
                  className="object-contain p-8"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-full items-center justify-center text-7xl font-bold text-brand-darker/50"
                >
                  {initial}
                </span>
              )}
            </div>

            <div className="px-5 pb-4 sm:px-8">
              {/* Centered avatar-over-cover on mobile, avatar-left row on desktop —
                  the same responsive switch FB pages do. */}
              <div className="flex flex-col items-center sm:flex-row sm:items-end sm:gap-5">
                {/* relative z-10: the cover's fill image is absolutely positioned, and
                    positioned boxes paint over in-flow content regardless of DOM order —
                    without this the cover covers the avatar's overlapping half. */}
                <div className="relative z-10 -mt-14 shrink-0 sm:-mt-16">
                  {business.logoUrl ? (
                    // The white ring lifts the avatar off the cover (the FB overlap);
                    // a thin black/10 hairline keeps a logo on a near-white background
                    // from melting into the ring.
                    <Image
                      src={business.logoUrl}
                      alt=""
                      width={128}
                      height={128}
                      className="h-28 w-28 rounded-full bg-white object-cover ring-4 ring-white sm:h-32 sm:w-32"
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
                  <h1 className="flex flex-wrap items-center justify-center gap-2 text-3xl font-semibold tracking-tight text-foreground sm:justify-start">
                    {business.name}
                    {business.verified && (
                      <>
                        <VerifiedIcon
                          className="h-6 w-6 shrink-0 text-brand"
                          title="Comercio verificado"
                        />
                        <span className="sr-only">Comercio verificado</span>
                      </>
                    )}
                  </h1>
                  {/* FB shows follower counts here; our social proof is the rating.
                      "Vinculado a", not "Apoya a": support comes from subscriptions,
                      which may target a school other than the linked one (see
                      TIER_BADGE in BusinessCard). Linking a school is optional —
                      unlinked businesses ("" id) show only the rating, if any. */}
                  {(stats.count > 0 || hasSchool) && (
                    <p className="mt-1 text-sm text-muted">
                      {stats.count > 0 && (
                        <>
                          <span aria-hidden className="text-amber-500">
                            ★
                          </span>{" "}
                          <span className="font-medium text-foreground">
                            {averageLabel}
                          </span>{" "}
                          ({stats.count}{" "}
                          {stats.count === 1 ? "reseña" : "reseñas"})
                        </>
                      )}
                      {stats.count > 0 && hasSchool && <> · </>}
                      {hasSchool && (
                        <>
                          Vinculado a{" "}
                          <Link
                            href={`/school/${business.schoolId}`}
                            className="font-medium text-brand-darker hover:underline"
                          >
                            {business.schoolName}
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                  {categoryChips.length > 0 && (
                    // The category line under the name, like FB's "Medio de
                    // comunicación/noticias". The clickable chips live in Información.
                    <p className="mt-1 text-sm text-muted">
                      {categoryChips.map((c) => c.name).join(" · ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-center sm:justify-start">
                <SupportBadge businessId={business.id} />
              </div>

              <ContactButtons
                businessId={business.id}
                businessName={business.name}
                contact={business.contact}
                discount={business.discount}
                coords={
                  business.location?.geopoint
                    ? {
                        lat: business.location.geopoint.latitude,
                        lng: business.location.geopoint.longitude,
                      }
                    : null
                }
              />

              {/* Edit/metrics shortcuts — only the page's managers see this. */}
              <ManageBar
                businessId={business.id}
                ownerId={business.ownerId}
                editorIds={business.editorIds}
                supportsSchool={Boolean(business.subscription?.active)}
              />

              {/* Section tabs (anchors) with scroll-spy. Only sections that exist. */}
              <SectionTabs
                sections={[
                  { id: "informacion", label: "Información" },
                  ...(gallery.length > 0
                    ? [{ id: "fotos", label: "Fotos" }]
                    : []),
                  { id: "resenas", label: "Reseñas" },
                ]}
              />
            </div>
          </header>

          {business.discount?.active && (
            // Semantic note (warning tone = "offer/deal"): soft tint fill + hairline
            // ring, matching the design-language banner recipe.
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warning-tint p-4 text-sm text-warning ring-1 ring-warning/10">
              <TagIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                {/* Same fallback as the card chip: active with empty text must not
                    render an empty banner. */}
                <span className="font-medium">
                  {business.discount.text || "Descuento"}
                </span>
                <span className="mt-1 block text-xs">
                  Mencioná que lo viste en escuelaplace al contactar para
                  aprovecharlo.
                </span>
              </p>
            </div>
          )}

          {/* ── Información (FB's intro card) ───────────────────────────────────── */}
          <section
            id="informacion"
            className="mt-4 scroll-mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6"
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Información
            </h2>
            {/* pre-line: the description is captured in a textarea — keep its line
                breaks. */}
            <p className="mt-3 whitespace-pre-line text-muted">
              {business.description}
            </p>

            {/* Category chips right after the description (not a trailing block of
                their own): with sparse data the card otherwise reads half-empty. */}
            {categoryChips.length > 0 && (
              <nav aria-label="Categorías" className="mt-3 flex flex-wrap gap-2">
                {categoryChips.map((c) => (
                  <Link
                    key={c.id}
                    href={`/category/${c.id}`}
                    className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted hover:border-brand-dark hover:text-brand-darker"
                  >
                    {c.name}
                  </Link>
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
                    {placeParts.join(", ")}
                  </li>
                )}
                {business.hours && (
                  <li className="flex items-start gap-3">
                    <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                    {/* pre-line: hours are free text the owner may write across
                        lines. */}
                    <span className="whitespace-pre-line">
                      {business.hours}
                    </span>
                  </li>
                )}
                {/* Phone and website also live in the action buttons; repeating them
                    here as readable text is the FB intro-card pattern (the buttons are
                    for acting, this list is for reading/copying). Same tracked
                    channels as the buttons, so the funnel metrics stay coherent. */}
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
          </section>

          {gallery.length > 0 && (
            <section
              id="fotos"
              aria-label="Fotos del comercio"
              className="mt-4 scroll-mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Fotos
              </h2>
              {/* Client island: the grid crops to squares, so the lightbox is the
                  only way to see the full photo. */}
              <PhotoGallery photos={gallery} businessName={business.name} />
            </section>
          )}

          <section
            id="resenas"
            className="mt-4 scroll-mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6"
          >
            <ReviewList reviews={reviews} stats={stats} />

            {/* The form goes AFTER the list: buyers come to read (social proof);
                writing — and the sign-in it asks for — is the secondary action. */}
            <div className="mt-6">
              <ReviewForm
                businessId={business.id}
                businessName={business.name}
                ownerId={business.ownerId}
                editorIds={business.editorIds}
              />
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
