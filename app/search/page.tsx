import type { Metadata } from "next";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { BrandBand } from "@/components/layout/BrandBand";
import { PageContainer } from "@/components/layout/PageContainer";
import { SearchBar } from "@/components/search/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchIcon, WarningIcon } from "@/components/ui/icons";
import {
  getActiveBusinessesCached,
  rankBusinessFeed,
  toBusinessCardData,
} from "@/lib/firestore";
import { relevanceScore, searchQuery } from "@/lib/search";
import type { BusinessCardData } from "@/types";

/**
 * Search results: /search?q=...
 *
 * SSR, like the catalog, but dynamic per query. Relevance R is computed in memory over the
 * active set and gates the results (R = 0 dropped); among the relevant, the mission-general
 * baseline orders them for SEO/first paint. <RankedFeed> then re-ranks client-side by the
 * buyer's community. Search result pages are noindex (thin/duplicate content).
 */

// Candidate set is the top-N active businesses by ranking.score; relevance is scored in
// memory over it. A highly relevant but low-ranked business beyond N won't surface — see the
// cap note below.
const SEARCH_CANDIDATE_MAX = 200;

interface Props {
  searchParams: Promise<{ q?: string; from?: string }>;
}

// Clearing the filter returns the user to where the search was launched from (the `from`
// param). Only accept same-origin app paths ("/...") so the param can't be turned into an
// open redirect to an external site.
function safeOrigin(from?: string): string {
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "";
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = searchQuery(q);
  return {
    title: query ? `Resultados para “${query}”` : "Buscar",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, from } = await searchParams;
  const query = searchQuery(q);
  const originPath = safeOrigin(from);

  let cards: BusinessCardData[] = [];
  let relevanceById: Record<string, number> = {};
  // Empty and error are different states: "no matches for this query" points the buyer
  // elsewhere; "catalog unavailable" (Firebase down) asks them to retry. Without this split
  // a Firestore outage would lie that the query has no matches.
  let loadFailed = false;
  // Whether the candidate set is saturated — drives the cap note so truncation is never silent.
  let candidatesSaturated = false;

  if (query) {
    try {
      const all = await getActiveBusinessesCached(SEARCH_CANDIDATE_MAX);
      candidatesSaturated = all.length === SEARCH_CANDIDATE_MAX;
      for (const b of all) {
        const r = relevanceScore(
          {
            name: b.name,
            categoryNames: b.categoryNames,
            description: b.description,
          },
          query,
        );
        if (r > 0) relevanceById[b.id] = r;
      }
      // Drop irrelevant businesses before ranking so the server-side subscription fan-out
      // only covers what will be shown. communitySchoolIds empty server-side: baseline
      // (mission-general) order over the relevant set for SEO.
      const relevant = all.filter((b) => relevanceById[b.id] != null);
      const ranked = await rankBusinessFeed(relevant, {
        communitySchoolIds: [],
        relevanceById,
      });
      cards = ranked.map((x) => toBusinessCardData(x.business));
    } catch {
      // Catalog/Firebase unavailable — route to the error state, not a misleading empty.
      loadFailed = true;
    }
  }

  // One stable <h1> per render: EmptyState only renders an <h2>, so the no-query / no-results
  // / error branches would otherwise have no h1. Render it once above the conditional.
  const heading = query ? `Resultados para “${query}”` : "Buscar";

  return (
    <>
      {/* Brand band echoing the home hero, with the floating search field lifted off it. */}
      <BrandBand size="band">
        {/* autoFocus only when arriving without a query: the user came to search and
            the empty state below asks them to type — focusing is the next action. With
            results on screen, stealing focus would just pop the mobile keyboard. */}
        <SearchBar
          initialQuery={query}
          autoFocus={!query}
          originPath={originPath}
        />
      </BrandBand>

      <PageContainer variant="listing">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {heading}
          </h1>
          {query && !loadFailed && cards.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              Comercios de tu comunidad que coinciden con tu búsqueda.
            </p>
          )}
        </header>

        {!query ? (
          <EmptyState
            icon={<SearchIcon className="h-7 w-7" />}
            title="Buscá comercios"
            description="Escribí el nombre, la categoría o lo que necesitás para encontrar comercios de tu comunidad."
            cta={{ label: "Explorar por categoría", href: "/categories" }}
          />
        ) : loadFailed ? (
          <EmptyState
            icon={<WarningIcon className="h-7 w-7" />}
            title="No pudimos cargar el catálogo"
            description="Recargá la página para intentarlo de nuevo."
          />
        ) : cards.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="h-7 w-7" />}
            title={`No encontramos comercios para “${query}”`}
            description="Probá con otras palabras o explorá el directorio por categoría."
            cta={{ label: "Explorar por categoría", href: "/categories" }}
          />
        ) : (
          <>
            <p role="status" className="sr-only">
              {cards.length} resultados para “{query}”.
            </p>
            <CommunityPicker />
            <RankedFeed initial={cards} relevanceById={relevanceById} />
            {candidatesSaturated && (
              <p className="mt-8 text-center text-sm text-muted">
                Mostrando coincidencias entre los {SEARCH_CANDIDATE_MAX}{" "}
                comercios con mejor ranking.
              </p>
            )}
          </>
        )}
      </PageContainer>
    </>
  );
}
