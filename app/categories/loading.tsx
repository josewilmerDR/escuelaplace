import { PageContainer } from "@/components/layout/PageContainer";
import { cardClass } from "@/components/ui/Card";

/**
 * Route-level skeleton for the category directory (ISR revalidation / client navigation):
 * without it, the page freezes on the previous view until the SSR getCategories read
 * finishes. Mirrors the page's layout (same PageContainer width and the same responsive
 * grid) with elevated placeholder cards so the real content swaps in without jumping. Shares
 * the page's layout primitives (PageContainer, cardClass) so it cannot drift from the real
 * page when those recipes change. Server-safe: no client-only hooks.
 */
const PLACEHOLDER_COUNT = 6;

export default function LoadingCategoriesPage() {
  return (
    <PageContainer variant="listing">
      <div aria-busy>
        {/* Header skeleton: title line + supporting line. */}
        <header className="mb-8">
          <div className="h-8 w-64 animate-pulse rounded bg-border" />
          <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-border" />
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
            <li key={i}>
              <div className={`flex items-center gap-4 ${cardClass("elevated")}`}>
                {/* Icon-tile placeholder + two text lines, matching the real card.
                    bg-border (not bg-surface) so the bars read against the white card. */}
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-border" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-border" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-border" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PageContainer>
  );
}
