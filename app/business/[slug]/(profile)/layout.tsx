import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ContactButtons } from "@/components/business/ContactButtons";
import { ManageBar } from "@/components/business/ManageBar";
import { SupportBadge } from "@/components/business/SupportBadge";
import { TrackPageView } from "@/components/business/TrackPageView";
import { Stars } from "@/components/reviews/Stars";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProfileHeader } from "@/components/layout/ProfileHeader";
import { ProfileTabs } from "@/components/layout/ProfileTabs";
import { TagIcon } from "@/components/ui/icons";
import {
  getBusinessBySlug,
  getSubscriptionsByBusiness,
  splitBusinessPhotos,
  supportedSchoolsOf,
} from "@/lib/firestore";
import { formatRating } from "@/lib/format";
import { PAGE_COVER_SIZES } from "@/lib/layout";
import { locationParts } from "@/lib/location";

/**
 * Shared chrome for the public business profile (/business/[slug] and its section
 * sub-routes). SSR for SEO. Renders the FB-page-style header (cover, overlapping avatar,
 * identity, rating + linked-school meta, support badge, contact buttons, manage bar), the
 * discount banner and the route tab strip — then hands the active section to `{children}`.
 * Each section lives at its own URL; this layout stays mounted across tab switches so only
 * the section content swaps. Reads are wrapped in React cache(), so the section pages
 * re-reading the same data cost no extra Firestore queries.
 *
 * TrackPageView fires once per visit here (the layout mounts once and survives tab
 * switches), so funnel metrics still count one view per visitor, not one per tab.
 */

// ISR safety net: without this the statically-generated business pages stay cached until the
// next deploy, so function-maintained fields (ranking, reviewStats) — which the client can't
// revalidate on-demand — would never refresh. 300s mirrors the catalog listings; owner edits
// still refresh instantly via revalidateBusinessCatalog (lib/revalidate.ts).
export const revalidate = 300;

interface Props {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function BusinessProfileLayout({ children, params }: Props) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  // Schools this business GENUINELY supports (counting, eligible subscriptions only),
  // deduped — feeds the "Escuelas" tab's existence. Degrades to empty on a flaky read.
  const supportedSchools = supportedSchoolsOf(
    await getSubscriptionsByBusiness(business.id).catch(() => []),
    [],
  );

  const { cover, gallery } = splitBusinessPhotos(business);
  const coverImage = cover ?? gallery[0];
  const initial = business.name.charAt(0).toUpperCase();
  // Cover fallback ladder: photo → logo contained on tint → big initial.
  const coverDescriptor = coverImage
    ? { src: coverImage, contain: false }
    : business.logoUrl
      ? { src: business.logoUrl, contain: true }
      : undefined;
  const placeParts = locationParts(business.location);
  const categoryChips = (business.categories ?? [])
    .map((id, i) => ({ id, name: business.categoryNames?.[i] }))
    .filter((c): c is { id: string; name: string } => Boolean(c.name));
  const hasSchool = Boolean(business.schoolId && business.schoolName);
  const stats = business.reviewStats ?? { count: 0, average: 0 };
  const averageLabel = formatRating(stats.average);

  const base = `/business/${business.slug}`;
  // Tabs: "Principal" (the index, holding Información) and Reseñas always exist; Fotos/Escuelas
  // only when they have content. Fotos leads (after the index) — the gallery is the storefront.
  const tabs = [
    { href: base, label: "Principal" },
    ...(gallery.length > 0 ? [{ href: `${base}/photos`, label: "Fotos" }] : []),
    ...(supportedSchools.length > 0
      ? [{ href: `${base}/schools`, label: "Escuelas" }]
      : []),
    { href: `${base}/reviews`, label: "Reseñas" },
  ];

  return (
    <PageContainer variant="detail">
      <TrackPageView businessId={business.id} />

      {/* Header card: cover + avatar + identity + actions + tabs. The viewTransitionId pairs
          with the one BusinessCard declares, and the cover/avatar fallback ladders match the
          card so landing here is never a visual downgrade. */}
      <ProfileHeader
        cover={coverDescriptor}
        coverSizes={PAGE_COVER_SIZES}
        viewTransitionId={`business-${business.id}`}
        avatar={business.logoUrl || undefined}
        initial={initial}
        name={business.name}
        verified={business.verified}
        verifiedLabel="Comercio verificado"
        meta={
          <>
            {(stats.count > 0 || hasSchool) && (
              <p className="mt-1 text-sm text-muted">
                {stats.count > 0 && (
                  <>
                    <Stars
                      value={stats.average}
                      decorative
                      className="align-[-0.125em] text-sm"
                    />{" "}
                    <span className="sr-only">Calificación promedio:</span>
                    <span className="font-medium text-foreground">
                      {averageLabel}
                    </span>{" "}
                    ({stats.count} {stats.count === 1 ? "reseña" : "reseñas"})
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
              <p className="mt-1 text-sm text-muted">
                {categoryChips.map((c) => c.name).join(" · ")}
              </p>
            )}
            {placeParts.length > 0 && (
              <p className="mt-1 text-sm text-muted">{placeParts.join(", ")}</p>
            )}
          </>
        }
      >
        <div className="flex justify-center sm:justify-start">
          <SupportBadge businessId={business.id} schoolsHref={`${base}/schools`} />
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

        {/* Section tabs — each is its own route. */}
        <ProfileTabs tabs={tabs} />
      </ProfileHeader>

      {business.discount?.active && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warning-tint p-4 text-sm text-warning ring-1 ring-warning/10">
          <TagIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            {/* Same fallback as the card chip: active with empty text must not render an
                empty banner. */}
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

      {children}
    </PageContainer>
  );
}
