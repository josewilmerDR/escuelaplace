import { BrandBand } from "@/components/layout/BrandBand";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Route-level skeleton for /search: the page is a dynamic SSR surface that blocks on a
 * Firestore read on every query, with no Suspense fallback — without this, the user sees
 * the previous page frozen with no feedback. This mirrors the real page's layout (a brand
 * band with the floating search field, then a listing column with a results grid) so the
 * real content replaces it without jumping ("parpadeo").
 *
 * Server component. The whole tree is a live region (`role="status"` + sr-only text) so
 * assistive tech announces the load; the decorative placeholders are `aria-hidden`.
 * Placeholder tones/classes match app/business/[slug]/loading.tsx so all skeletons read as
 * one family (animate-pulse, rounded shapes, bg-surface placeholders, ring/shadow).
 */
export default function SearchLoading() {
  return (
    <div role="status">
      <span className="sr-only">Cargando resultados…</span>

      <div aria-hidden="true">
        {/* Brand band echoing the real one, with the floating search field standing in as a
            rounded-2xl white pulse bar lifted off the gradient. */}
        <BrandBand size="band">
          <div className="h-12 w-full animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-black/5" />
        </BrandBand>

        <PageContainer variant="listing">
          {/* Header placeholder: a wide title bar + a thin subline. */}
          <header className="mb-8">
            <div className="h-8 w-72 max-w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
            <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
          </header>

          {/* Results grid: same columns as RankedFeed (grid gap-5 sm:grid-cols-2
              lg:grid-cols-3). Each card mirrors a real BusinessCard silhouette: an
              aspect-video cover + a row with a 40px avatar circle and two text lines. */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
              >
                <div className="aspect-video w-full animate-pulse bg-surface" />
                <div className="flex flex-1 gap-3 p-4">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="h-4 w-5/6 animate-pulse rounded bg-surface ring-1 ring-black/5" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-surface ring-1 ring-black/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PageContainer>
      </div>
    </div>
  );
}
