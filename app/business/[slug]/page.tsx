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
import { SiteHeader } from "@/components/layout/SiteHeader";
import { OwnReviewMark } from "@/components/reviews/OwnReviewMark";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { Stars } from "@/components/reviews/Stars";
import { TrackedLink } from "@/components/business/TrackedLink";
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
      <SiteHeader />

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
          <header className="overflow-hidden rounded-2xl border border-border bg-white">
            {/* Cover: same fallback ladder as BusinessCard (photo → logo contained on
                tint → big initial), so landing here from a card is never a visual
                downgrade. The viewTransitionName pairs with the one the card declares.
                Wider than 16:9 on desktop — FB covers are short bands. */}
            <div
              className="relative aspect-video w-full bg-brand-tint sm:aspect-[5/2]"
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
                  className="flex h-full items-center justify-center text-7xl font-bold text-brand-darker/40"
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
                    <Image
                      src={business.logoUrl}
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
                    <p className="mt-1 text-sm text-slate-600">
                      {stats.count > 0 && (
                        <>
                          <span aria-hidden className="text-amber-500">
                            ★
                          </span>{" "}
                          <span className="font-medium text-slate-900">
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
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
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
            className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
          >
            <h2 className="text-xl font-semibold">Información</h2>
            {/* pre-line: the description is captured in a textarea — keep its line
                breaks. */}
            <p className="mt-3 whitespace-pre-line text-gray-700">
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
                    className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-brand-dark hover:text-brand-darker"
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
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
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
              className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
            >
              <h2 className="text-xl font-semibold">Fotos</h2>
              {/* Client island: the grid crops to squares, so the lightbox is the
                  only way to see the full photo. */}
              <PhotoGallery photos={gallery} businessName={business.name} />
            </section>
          )}

          <section
            id="resenas"
            className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Reseñas</h2>
              {stats.count > 0 && (
                <span className="flex items-center gap-1 text-sm text-muted">
                  {/* decorative: the number right after already carries the rating. */}
                  <Stars value={stats.average} decorative />
                  <span className="sr-only">Calificación promedio:</span>
                  {averageLabel} ({stats.count})
                </span>
              )}
            </div>

            {reviews.length === 0 ? (
              <p className="mt-6 text-sm text-muted">
                Todavía no hay reseñas. Sé la primera persona en dejar una.
              </p>
            ) : (
              <ul className="mt-6 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-slate-900">
                          {r.authorName}
                        </span>
                        <OwnReviewMark authorId={r.authorId} />
                        {r.createdAt && (
                          <span className="shrink-0 text-xs text-muted">
                            {r.createdAt.toDate().toLocaleDateString("es-CR", {
                              month: "long",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </span>
                      <Stars value={r.rating} className="shrink-0 text-sm" />
                    </div>
                    {r.text && (
                      // pre-line: written in a textarea — keep the line breaks.
                      <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
                        {r.text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {stats.count > reviews.length && (
              <p className="mt-3 text-xs text-muted">
                Mostrando las {reviews.length} reseñas más recientes de{" "}
                {stats.count}.
              </p>
            )}

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

/* Inline icons (Heroicons paths) — server-safe, no icon dependency. */

/** Solid check-badge, the FB-style verified mark. */
function VerifiedIcon({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      {title && <title>{title}</title>}
      <path
        fillRule="evenodd"
        d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.137-.089l3.75-5.25Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m-16.432 0A8.959 8.959 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  );
}
