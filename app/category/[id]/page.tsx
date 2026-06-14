import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { PageContainer } from "@/components/layout/PageContainer";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { TagIcon, WarningIcon } from "@/components/ui/icons";
import {
  getCategoryById,
  getBusinessesByCategory,
  toBusinessCardData,
} from "@/lib/firestore";
import type { BusinessCardData } from "@/types";

/**
 * Public listing by category: /category/[id]
 * SSR for SEO, same feed pattern as home and /search: baseline order (stored
 * ranking.score) server-side, re-ranked client-side per the buyer's community.
 */

// Upper bound of cards listed; we surface a footer note when we hit it (see below) so the
// cap is never silent. Independent from the data layer's default so it isn't a hidden 50.
const CATEGORY_LISTING_MAX = 200;

// ISR: re-render the baseline (stored ranking.score order) every 5 minutes — the same
// window as home/categories/schools — so SEO stays fresh as scores change without paying a
// Firestore read per request. Per-buyer personalization happens client-side in <RankedFeed>.
export const revalidate = 300;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const category = await getCategoryById(id);
  if (!category) return { title: "Categoría no encontrada" };
  const title = category.name;
  const description = `Comercios de la categoría ${category.name} que apoyan a escuelas de tu comunidad.`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { id } = await params;
  // The category itself stays outside the catalog try/catch: a missing category is a 404,
  // not a "catalog unavailable" state.
  const category = await getCategoryById(id);
  if (!category) notFound();

  // Empty and error are different states: "no businesses in this category yet" points the
  // buyer elsewhere; "catalog unavailable" (Firebase down) asks them to retry.
  let cards: BusinessCardData[] = [];
  let loadFailed = false;
  try {
    cards = (await getBusinessesByCategory(id, CATEGORY_LISTING_MAX)).map(
      toBusinessCardData,
    );
  } catch {
    loadFailed = true;
  }

  // Breadcrumb + item list so search engines understand where this page sits and what it
  // lists. "<" escaped so category/business names can't close the script tag.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: "/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Categorías",
        item: "/categories",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: category.name,
        item: `/category/${id}`,
      },
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: cards.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: `/business/${c.slug}`,
    })),
  };

  return (
    <PageContainer variant="listing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c"),
        }}
      />
      {cards.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListLd).replace(/</g, "\\u003c"),
          }}
        />
      )}

      <div className="mb-6">
        <BackLink href="/categories">Todas las categorías</BackLink>
      </div>

      <header className="mb-8 flex items-center gap-4">
        {/* App-icon tile carrying the category glyph, mirroring the categories index. */}
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-2xl text-brand-darker ring-1 ring-inset ring-brand-dark/10"
        >
          {category.icon}
        </span>
        <div className="min-w-0">
          <h1 className="min-w-0 break-words text-3xl font-semibold tracking-tight text-foreground">
            {category.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Comercios de tu comunidad en esta categoría.
          </p>
        </div>
      </header>

      {loadFailed ? (
        <EmptyState
          icon={<WarningIcon className="h-7 w-7" />}
          title="No pudimos cargar el catálogo"
          description="Recargá la página para intentarlo de nuevo."
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="h-7 w-7" />}
          title="Todavía no hay comercios en esta categoría"
          description="Probá con otra categoría o volvé más tarde: el directorio crece con la comunidad."
          cta={{ label: "Ver todas las categorías", href: "/categories" }}
        />
      ) : (
        <>
          {/* The picker only renders with results: setting a school can't reorder an empty
              list, and it would just clutter the empty/error states. */}
          <CommunityPicker />
          <RankedFeed initial={cards} />
          {cards.length === CATEGORY_LISTING_MAX && (
            <p className="mt-8 text-center text-sm text-muted">
              Mostrando los {CATEGORY_LISTING_MAX} comercios con mejor ranking de
              esta categoría.
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}
