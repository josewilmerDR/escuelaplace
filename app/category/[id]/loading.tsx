import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Route-level skeleton for /category/[id]: without it, clicking a category freezes the
 * current page until the listing's SSR Firestore reads finish. Mirrors the page's layout
 * (listing column, icon-tile + title header, then the 1/2/3-column card grid the
 * RankedFeed/BusinessCard render) so the real content swaps in without a jump.
 */
export default function LoadingCategoryPage() {
  return (
    <PageContainer variant="listing">
      <div aria-busy>
        {/* Header: icon tile + title/subtitle bars, matching the page's offsets. */}
        <div className="mb-8 flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-surface" />
          <div className="min-w-0 flex-1">
            <div className="h-8 w-2/3 max-w-xs animate-pulse rounded bg-surface" />
            <div className="mt-2 h-4 w-1/2 max-w-[16rem] animate-pulse rounded bg-surface" />
          </div>
        </div>

        {/* Card grid: same columns/gap as the feed. Each placeholder mirrors a
            BusinessCard — aspect-video cover on top, then a text block. */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5"
            >
              <div className="aspect-video w-full animate-pulse bg-surface" />
              <div className="flex gap-3 p-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-surface" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
