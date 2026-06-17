import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Route-level skeleton for /search: the page is a dynamic SSR surface that blocks on a
 * Firestore read on every query, with no Suspense fallback — without this, the user sees
 * the previous page frozen with no feedback. This mirrors the real page's layout (the search
 * field flush on the white listing column, then a results grid) so the real content replaces
 * it without jumping ("parpadeo").
 *
 * Server component. The whole tree is a live region (`role="status"` + sr-only text) so
 * assistive tech announces the load; the decorative placeholders are `aria-hidden`. It shares
 * the role="status" live-region a11y pattern with app/business/[slug]/loading.tsx, but its
 * palette+structure mirror the sibling LISTING skeletons app/category/[id]/loading.tsx and
 * app/schools/loading.tsx — bg-border (not bg-surface) placeholders so the bars read against
 * the white listing canvas (PageContainer variant="listing"). These siblings should not drift.
 */
export default function SearchLoading() {
  return (
    <div role="status">
      <span className="sr-only">Cargando resultados…</span>

      <div aria-hidden="true">
        <PageContainer variant="listing">
          {/* The real SearchBar sits flush on the white page (no brand band), constrained to
              max-w-2xl and centered. Match its width, height (h-14 ≈ the ~56px field) and
              flat elevation (shadow-sm + ring-border) so the field doesn't resize/shift on
              swap-in. */}
          <div className="mx-auto mb-10 max-w-2xl">
            <div className="h-14 w-full animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-border" />
          </div>

          {/* Header placeholder: a wide title bar + a thin subline. The subline approximates
              the with-results header (the page only renders it when there are matches); the
              happy path is the common case for a query, so reserve it. */}
          <header className="mb-8">
            <div className="h-8 w-2/3 max-w-xs animate-pulse rounded bg-border ring-1 ring-black/5" />
            <div className="mt-2 h-4 w-1/2 max-w-sm animate-pulse rounded bg-border ring-1 ring-black/5" />
          </header>

          {/* Community picker strip placeholder: the page renders <CommunityPicker /> here
              before the grid, so reserve its height to keep loading→loaded from jumping.
              Its real height varies (collapsed chip vs full card); this approximates the
              expanded card, the first-paint default when the buyer has no saved community. */}
          <div className="mb-8 h-24 animate-pulse rounded-2xl bg-border" />

          {/* Results grid: same columns as RankedFeed (grid gap-5 sm:grid-cols-2
              lg:grid-cols-3). Each card mirrors a real BusinessCard silhouette: an
              aspect-video cover + a row with a 40px avatar circle, a title line and a meta
              line (rating · categories). */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
              >
                <div className="aspect-video w-full animate-pulse bg-border" />
                <div className="flex flex-1 gap-3 p-4">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-border ring-1 ring-black/5" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-border ring-1 ring-black/5" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-border ring-1 ring-black/5" />
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
