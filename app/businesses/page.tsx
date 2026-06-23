import type { Metadata } from "next";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { CatalogTabs } from "@/components/layout/CatalogTabs";
import { SearchBar } from "@/components/search/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { TagIcon, WarningIcon } from "@/components/ui/icons";
import {
  getCategories,
  getTopBusinesses,
  toBusinessCardData,
} from "@/lib/firestore";
import type { BusinessCardData, CategoryDoc } from "@/types";

/**
 * Comercios (/businesses) — the business catalog. Server component for SEO. This is the "what
 * can I buy / who supports the schools" surface that used to be the home; the home now leads
 * with the school directory and links here via <CatalogTabs>. The feed is rendered SSR in the
 * baseline ranking.score order and re-ranked client-side per the buyer's community by <RankedFeed>.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Comercios",
  description:
    "El directorio de comercios de tu comunidad. Comprales y apoyá a las escuelas que ellos sostienen.",
};

export default async function BusinessesPage() {
  // Empty vs error are different states: "no businesses yet" gets an onboarding CTA,
  // "catalog unavailable" gets a retry message. Don't collapse them.
  let cards: BusinessCardData[] = [];
  let loadFailed = false;
  try {
    cards = (await getTopBusinesses(24)).map(toBusinessCardData);
  } catch {
    loadFailed = true;
  }

  // Category chips are the browse path for buyers who don't know what to search yet.
  // Best-effort: empty categories are skipped and a fetch failure just hides the row.
  let categories: CategoryDoc[] = [];
  try {
    categories = (await getCategories()).filter((c) => c.businessCount > 0);
  } catch {}

  return (
    <main>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Los comercios de tu comunidad
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
            Comprales y apoyá a las escuelas que cada uno sostiene.
          </p>
          <div className="mx-auto mt-6 max-w-2xl">
            <SearchBar />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-4 pb-20">
        <CatalogTabs active="businesses" />

        <div className="mt-6">
          {categories.length > 0 && (
            <nav aria-label="Categorías" className="mb-4 flex items-start gap-2">
              <ul className="flex max-h-[42px] min-w-0 flex-1 flex-wrap gap-2 overflow-hidden">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Chip href={`/category/${c.id}`} icon={c.icon}>
                      {c.name}
                    </Chip>
                  </li>
                ))}
              </ul>
              <Chip href="/categories" emphasis="brand" className="shrink-0">
                Todas las categorías
              </Chip>
            </nav>
          )}

          {loadFailed ? (
            <EmptyState
              icon={<WarningIcon className="h-7 w-7" />}
              title="No pudimos cargar el catálogo"
              description="Recargá la página para intentarlo de nuevo."
            />
          ) : cards.length === 0 ? (
            <EmptyState
              icon={<TagIcon className="h-7 w-7" />}
              title="Todavía no hay comercios publicados"
              description="Sé el primero en sumarte: creá la página de tu comercio y aparecé en el directorio de tu comunidad."
              cta={{ label: "Creá la página del tuyo", href: "/create" }}
            />
          ) : (
            <RankedFeed initial={cards} />
          )}
        </div>
      </section>
    </main>
  );
}
