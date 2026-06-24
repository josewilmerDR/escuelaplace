import type { Metadata } from "next";
import { CatalogSchools } from "@/components/feed/CatalogSchools";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { CatalogTabs } from "@/components/layout/CatalogTabs";
import { SearchBar } from "@/components/search/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { TagIcon, WarningIcon } from "@/components/ui/icons";
import {
  getCategories,
  getSchoolIdsWithActiveProject,
  getSchoolsCached,
  getTopBusinesses,
  rankSchoolsByRelevance,
  toBusinessCardData,
  toSchoolCardData,
} from "@/lib/firestore";
import type {
  BusinessCardData,
  CategoryDoc,
  SchoolCardData,
} from "@/types";

/**
 * Comercios (/businesses) — the business catalog. Server component for SEO. This is the "what can
 * I buy / who supports the schools" surface, reached via <CatalogTabs> from the school directory
 * home. The feed is the list of businesses (re-ranked client-side per the buyer's community by
 * <RankedFeed>), with the schools block interleaved after the first row (<CatalogSchools>): top
 * supported schools + the breadth carousel when no school is chosen, or the chosen school's latest
 * publications once the buyer picked one.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Comercios",
  description:
    "El directorio de comercios de tu comunidad. Comprales y apoyá a las escuelas que ellos sostienen.",
};

// Bound the schools candidate pool shipped to the client: the block shows a few, the rest are the
// proximity re-rank pool when the buyer sets a location.
const SCHOOL_CANDIDATES = 24;

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

  // Schools interleaved into the catalog feed (<CatalogSchools>): ranked by community support on
  // the server (SEO-visible), personalized client-side. Best-effort — a failed read just omits
  // the block.
  let schoolCards: SchoolCardData[] = [];
  try {
    const schools = await getSchoolsCached();
    const activeProjectSchoolIds = await getSchoolIdsWithActiveProject().catch(
      () => new Set<string>(),
    );
    schoolCards = rankSchoolsByRelevance(
      schools.map((s) =>
        toSchoolCardData(s, { hasActiveProject: activeProjectSchoolIds.has(s.id) }),
      ),
      {},
    )
      .slice(0, SCHOOL_CANDIDATES)
      .map((r) => r.school);
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
            <RankedFeed
              initial={cards}
              interleave={
                schoolCards.length > 0 ? (
                  <CatalogSchools initial={schoolCards} />
                ) : undefined
              }
            />
          )}
        </div>
      </section>
    </main>
  );
}
