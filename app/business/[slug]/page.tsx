import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactButtons } from "@/components/business/ContactButtons";
import { SupportBadge } from "@/components/business/SupportBadge";
import { TrackPageView } from "@/components/business/TrackPageView";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { OwnReviewMark } from "@/components/reviews/OwnReviewMark";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { Stars } from "@/components/reviews/Stars";
import { normalizePhoneInternational } from "@/lib/contact";
import { getBusinessBySlug, getReviewsByBusiness } from "@/lib/firestore";

/**
 * Public business page: /business/[slug]
 * SSR for SEO. The rich profile (cover/photos, description, discount, linked school) and
 * the reviews are rendered on the server reading Firestore by slug (active businesses
 * only — see getBusinessBySlug). Writing a review is a client island (<ReviewForm>) that
 * requires Google sign-in.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

/** The page column is max-w-3xl (768px) minus px-6 — lets next/image pick the size. */
const COVER_SIZES = "(min-width: 768px) 720px, 100vw";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) return { title: "Comercio no encontrado" };
  // og:image drives the share preview on WhatsApp — the platform's main share channel.
  // Same priority as the profile cover: first photo, logo as fallback.
  const image = business.photos?.[0] ?? business.logoUrl;
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
  // Legacy docs may lack the photos field entirely (same defensiveness as serialize.ts).
  const photos = business.photos ?? [];
  const gallery = photos.slice(1);
  const initial = business.name.charAt(0).toUpperCase();
  // Where the business is, in words: the buyer must not need to open Maps ("Cómo
  // llegar") just to find out the canton. Address is optional, the rest may be empty
  // strings on legacy docs.
  const locationParts = [
    business.location?.address,
    business.location?.district,
    business.location?.canton,
    business.location?.province,
  ].filter(Boolean);
  // categories (ids) and categoryNames are parallel denormalized arrays; zip them and
  // drop entries whose name is missing.
  const categoryChips = (business.categories ?? [])
    .map((id, i) => ({ id, name: business.categoryNames?.[i] }))
    .filter((c): c is { id: string; name: string } => Boolean(c.name));
  const averageLabel = stats.average.toLocaleString("es-CR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

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
    ...(photos[0] || business.logoUrl
      ? { image: photos[0] ?? business.logoUrl }
      : {}),
    ...(phone ? { telephone: `+${phone}` } : {}),
    ...(business.location
      ? {
          address: {
            "@type": "PostalAddress",
            ...(business.location.address
              ? { streetAddress: business.location.address }
              : {}),
            addressLocality: business.location.canton,
            addressRegion: business.location.province,
            addressCountry: "CR",
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

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* "<" escaped so merchant-controlled text can't close the script tag. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <TrackPageView businessId={business.id} />

        {/* Cover: same fallback ladder as BusinessCard (photo → logo contained on tint →
            big initial), so landing here from a card is never a visual downgrade. The
            viewTransitionName pairs with the one the card declares. */}
        <div
          className="relative aspect-video w-full overflow-hidden rounded-2xl bg-brand-tint"
          style={{ viewTransitionName: `business-${business.id}` }}
        >
          {photos[0] ? (
            <Image
              src={photos[0]}
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

        <h1 className="mt-6 text-3xl font-bold">{business.name}</h1>
        {/* "Vinculado a", not "Apoya a": support comes from subscriptions, which may
            target a school other than the linked one (see TIER_BADGE in BusinessCard). */}
        <p className="mt-1 text-sm text-slate-600">
          Vinculado a{" "}
          <Link
            href={`/school/${business.schoolId}`}
            className="font-medium text-brand-darker hover:underline"
          >
            {business.schoolName}
          </Link>
        </p>
        {locationParts.length > 0 && (
          <p className="mt-1 text-sm text-slate-600">
            {locationParts.join(", ")}
          </p>
        )}
        {business.hours && (
          // pre-line: hours are free text the owner may write across lines.
          <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
            Horario: {business.hours}
          </p>
        )}

        <SupportBadge businessId={business.id} />

        {categoryChips.length > 0 && (
          <nav aria-label="Categorías" className="mt-4 flex flex-wrap gap-2">
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

        {/* pre-line: the description is captured in a textarea — keep its line breaks. */}
        <p className="mt-4 whitespace-pre-line text-gray-700">
          {business.description}
        </p>
        {business.discount?.active && (
          <p className="mt-4 rounded bg-amber-50 p-3 text-amber-800">
            {/* Same fallback as the card chip: active with empty text must not render
                an empty banner. */}
            {business.discount.text || "Descuento"}
            <span className="mt-1 block text-xs font-normal">
              Mencioná que lo viste en escuelaplace al contactar para
              aprovecharlo.
            </span>
          </p>
        )}

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

        {gallery.length > 0 && (
          <section aria-label="Fotos del comercio" className="mt-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gallery.map((src, i) => (
                <div
                  key={i}
                  className="relative aspect-square overflow-hidden rounded-xl bg-brand-tint"
                >
                  <Image
                    src={src}
                    alt={`Foto de ${business.name}`}
                    fill
                    sizes="(min-width: 640px) 240px, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
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

          {/* The form goes AFTER the list: buyers come to read (social proof); writing —
              and the sign-in it asks for — is the secondary action. */}
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
    </>
  );
}
