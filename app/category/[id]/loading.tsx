import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Route-level skeleton for /category/[id]: without it, clicking a category freezes the
 * current page until the listing's SSR Firestore reads finish. Mirrors the page's layout
 * (listing column, icon-tile + title header, the community picker strip, then the
 * 1/2/3-column card grid the RankedFeed/BusinessCard render) so the real content swaps in
 * without a jump ("parpadeo").
 *
 * Server component. The whole tree is a live region (`role="status"` + sr-only text) so
 * assistive tech announces the load; the decorative placeholders are `aria-hidden`. Mirrors
 * the a11y pattern of app/business/[slug]/loading.tsx — neither skeleton should drift.
 */
export default function LoadingCategoryPage() {
  return (
    <PageContainer variant="listing">
      <div role="status">
        <span className="sr-only">Cargando comercios…</span>

        <div aria-hidden="true">
          {/* Header: icon tile + title/subtitle bars, matching the page's offsets. */}
          <div className="mb-8 flex items-center gap-4">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
            <div className="min-w-0 flex-1">
              <div className="h-8 w-2/3 max-w-xs animate-pulse rounded bg-surface ring-1 ring-black/5" />
              <div className="mt-2 h-4 w-1/2 max-w-sm animate-pulse rounded bg-surface ring-1 ring-black/5" />
            </div>
          </div>

          {/* Community picker strip placeholder: the page renders <CommunityPicker /> here
              before the grid, so reserve its height to keep loading→loaded from jumping.
              Its real height varies (collapsed chip vs full card); this approximates the
              expanded card, the first-paint default when the buyer has no saved community. */}
          <div className="mb-8 h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />

          {/* Card grid: same columns/gap as the feed. Each placeholder mirrors a
              BusinessCard — shadow-sm so it doesn't "lift" when the real card swaps in,
              aspect-video cover on top, then a text block. */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
              >
                <div className="aspect-video w-full animate-pulse bg-surface" />
                <div className="flex gap-3 p-4">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-surface ring-1 ring-black/5" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-surface ring-1 ring-black/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
