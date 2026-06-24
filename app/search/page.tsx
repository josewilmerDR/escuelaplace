import type { Metadata } from "next";
import Link from "next/link";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
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
  const relevanceById: Record<string, number> = {};
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
            tags: b.tags,
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

  return (
    <PageContainer variant="listing">
      {/* The search field sits directly on the white page (no brand band), so it reads as part
          of the results surface rather than a separate hero. It's the single search
          affordance — there's deliberately no "Buscar" page title repeating it below
          ("menos es más"). Constrained to the home hero's width and centered.
          autoFocus only when arriving without a query: the user came to search, so the field
          is the next action. With results on screen, stealing focus would just pop the mobile
          keyboard. */}
      <div className="mx-auto mb-10 max-w-2xl">
        <SearchBar
          initialQuery={query}
          autoFocus={!query}
          originPath={originPath}
          flat
        />
      </div>

      {!query ? (
        // No query yet: the search field above is self-evidently the search, so we drop the
        // repeated "Buscar" heading and the heavy empty-state tile — just one quiet nudge
        // toward browsing by category. The h1 stays for a11y/SEO but sr-only.
        <>
          <h1 className="sr-only">Buscar comercios</h1>
          <p className="mx-auto max-w-sm text-center text-sm text-muted">
            Escribe lo que necesitas, o{" "}
            <Link
              href="/categories"
              className="font-medium text-brand-darker underline-offset-2 hover:underline"
            >
              explora por categoría
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <header className="mb-8">
            {/* Result-summary heading — the one place the page names the query back. */}
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Resultados para “{query}”
            </h1>
            {!loadFailed && cards.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                Comercios de tu comunidad que coinciden con tu búsqueda.
              </p>
            )}
          </header>

          {loadFailed ? (
            <EmptyState
              icon={<WarningIcon className="h-7 w-7" />}
              title="No pudimos cargar el catálogo"
              description="Recarga la página para intentarlo de nuevo."
            />
          ) : cards.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="h-7 w-7" />}
              title={`No encontramos comercios para “${query}”`}
              description="Prueba con otras palabras o explora el directorio por categoría."
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
        </>
      )}
    </PageContainer>
  );
}
