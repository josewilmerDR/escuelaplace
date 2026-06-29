import type { Metadata } from "next";
import { CatalogSchools } from "@/components/feed/CatalogSchools";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { CatalogTabs } from "@/components/layout/CatalogTabs";
import { CategoryStrip } from "@/components/search/CategoryStrip";
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
    "El directorio de comercios de tu comunidad. Cómprales y apoya a las escuelas que ellos sostienen.",
};

// Bound the schools candidate pool shipped to the client: the block shows a few, the rest are the
// proximity re-rank pool when the buyer sets a location.
const SCHOOL_CANDIDATES = 24;

// Render cap for the business feed (top-N by ranking): at the cap the page is a curated top
// rather than the whole catalog.
const BUSINESS_LIMIT = 24;

export default async function BusinessesPage() {
  // Empty vs error are different states: "no businesses yet" gets an onboarding CTA,
  // "catalog unavailable" gets a retry message. Don't collapse them.
  let cards: BusinessCardData[] = [];
  let loadFailed = false;
  try {
    cards = (await getTopBusinesses(BUSINESS_LIMIT)).map(toBusinessCardData);
  } catch {
    loadFailed = true;
  }

  // The category strip is the browse-by-rubro path for buyers who don't know what to search yet.
  // Best-effort: empty categories are skipped and a fetch failure just hides the strip.
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
      {/* Catalog section switch, pinned just under the top bar so switching between the school
          directory and the business catalog is always one tap away. */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-6">
          <CatalogTabs active="businesses" />
        </div>
      </section>

      {/* Compact category carousel pinned at the top of the catalog — the first browse affordance
          under the section tabs. Hidden when there are no categories. */}
      {categories.length > 0 && (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-4">
            <CategoryStrip categories={categories} />
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-6 pt-6 pb-20">
        <div>
          {loadFailed ? (
            <EmptyState
              icon={<WarningIcon className="h-7 w-7" />}
              title="No pudimos cargar el catálogo"
              description="Recarga la página para intentarlo de nuevo."
            />
          ) : cards.length === 0 ? (
            <EmptyState
              icon={<TagIcon className="h-7 w-7" />}
              title="Todavía no hay comercios publicados"
              description="Sé el primero en sumarte: crea la página de tu comercio y aparece en el directorio de tu comunidad."
              cta={{ label: "Crea la página del tuyo", href: "/create" }}
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
