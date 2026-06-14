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

export const metadata: Metadata = {
  title: "Todas las categorías",
};

export default async function CategoriesPage() {
  let categories: CategoryDoc[] = [];
  let loadFailed = false;
  try {
    categories = await getCategories();
  } catch {
    loadFailed = true;
  }

  return (
    <PageContainer variant="listing">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Todas las categorías
        </h1>
        <p className="mt-1 text-sm text-muted">
          Explorá el directorio por rubro y encontrá comercios de tu comunidad.
        </p>
      </header>

      {loadFailed ? (
        <EmptyState
          icon={<WarningIcon className="h-7 w-7" />}
          title="No pudimos cargar las categorías"
          description="Recargá la página para intentarlo de nuevo."
        />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="h-7 w-7" />}
          title="Todavía no hay categorías publicadas"
          description="Volvé más tarde: el directorio crece con la comunidad."
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
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-2xl ring-1 ring-inset ring-brand-dark/10"
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
