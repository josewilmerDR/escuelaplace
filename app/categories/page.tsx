import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TagIcon, WarningIcon } from "@/components/ui/icons";
import { pluralizeBusinesses } from "@/lib/format";
import { getCategories } from "@/lib/firestore";
import type { CategoryDoc } from "@/types";

/**
 * Full category listing: /categories
 * Linked from the home page's single-line category row ("Todas las categorías").
 * Server component — rendered on the server for SEO. Unlike the home row, this
 * page shows every category (including empty ones): it is the exhaustive
 * directory, and /category/[id] already handles the empty state.
 */

// Same ISR window as the home page: businessCount changes at most every 5 minutes.
export const revalidate = 300;

const DESCRIPTION =
  "Explora el directorio por rubro y encuentra comercios de tu comunidad.";

export const metadata: Metadata = {
  title: "Todas las categorías",
  description: DESCRIPTION,
  openGraph: { title: "Todas las categorías", description: DESCRIPTION },
};

export default async function CategoriesPage() {
  let categories: CategoryDoc[] = [];
  let loadFailed = false;
  try {
    categories = await getCategories();
  } catch {
    loadFailed = true;
  }

  // Breadcrumb + item list so search engines understand where this page sits and what it
  // lists. "<" escaped so category names can't close the script tag. Mirrors the JSON-LD on
  // /category/[id] so the directory and its listings describe the same shape to crawlers.
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
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: categories.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: `/category/${c.id}`,
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
      {categories.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListLd).replace(/</g, "\\u003c"),
          }}
        />
      )}

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Todas las categorías
        </h1>
        <p className="mt-1 text-sm text-muted">
          Explora el directorio por rubro y encuentra comercios de tu comunidad.
        </p>
      </header>

      {loadFailed ? (
        <EmptyState
          icon={<WarningIcon className="h-7 w-7" />}
          title="No pudimos cargar las categorías"
          description="Recarga la página para intentarlo de nuevo."
        />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="h-7 w-7" />}
          title="Todavía no hay categorías publicadas"
          description="Vuelve más tarde: el directorio crece con la comunidad."
          cta={{ label: "Volver al inicio", href: "/" }}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.id}>
              {/* Calm-depth card led by an app-icon tile holding the category glyph;
                  the brand ring lights up on hover instead of a hard border swap. */}
              <Link
                href={`/category/${c.id}`}
                className={`flex items-center gap-4 ${cardClass("elevated")} transition hover:shadow-md hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none`}
              >
                <span
                  aria-hidden
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-2xl text-brand-darker ring-1 ring-inset ring-brand-dark/10"
                >
                  {c.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold tracking-tight text-foreground">
                    {c.name}
                  </span>
                  <span className="block text-sm text-muted">
                    {pluralizeBusinesses(c.businessCount)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
