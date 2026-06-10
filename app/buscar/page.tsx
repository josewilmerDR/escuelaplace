import type { Metadata } from "next";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SearchBar } from "@/components/search/SearchBar";
import {
  getActiveBusinesses,
  rankBusinessFeed,
  toBusinessCardData,
} from "@/lib/firestore";
import { relevanceScore } from "@/lib/search";
import type { BusinessCardData } from "@/types";

/**
 * Search results: /buscar?q=...
 *
 * SSR, like the catalog, but dynamic per query. Relevance R is computed in memory over the
 * active set and gates the results (R = 0 dropped); among the relevant, the mission-general
 * baseline orders them for SEO/first paint. <RankedFeed> then re-ranks client-side by the
 * buyer's community. Search result pages are noindex (thin/duplicate content).
 */
interface Props {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  return {
    title: query ? `Resultados para "${query}"` : "Buscar",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let cards: BusinessCardData[] = [];
  let relevanceById: Record<string, number> = {};

  if (query) {
    try {
      const all = await getActiveBusinesses(200);
      relevanceById = {};
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
      // communitySchoolIds empty server-side: baseline (mission-general) order for SEO.
      const ranked = await rankBusinessFeed(all, {
        communitySchoolIds: [],
        relevanceById,
      });
      cards = ranked.map((x) => toBusinessCardData(x.business));
    } catch {
      // Catalog/Firebase unavailable — render the empty state.
    }
  }

  return (
    <>
      <SiteHeader />

      <section className="bg-brand py-8">
        <div className="mx-auto max-w-3xl px-6">
          {/* autoFocus only when arriving without a query: the user came to search and
              the empty state below asks them to type — focusing is the next action. With
              results on screen, stealing focus would just pop the mobile keyboard. */}
          <SearchBar initialQuery={query} autoFocus={!query} />
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {!query ? (
          <p className="text-muted">Escribí algo para buscar comercios.</p>
        ) : cards.length === 0 ? (
          <p className="text-muted">
            No encontramos comercios para <span className="font-medium">“{query}”</span>.
          </p>
        ) : (
          <>
            <h1 className="mb-8 text-2xl font-bold tracking-tight text-slate-900">
              Resultados para “{query}”
            </h1>
            <CommunityPicker />
            <RankedFeed initial={cards} relevanceById={relevanceById} />
          </>
        )}
      </main>
    </>
  );
}
