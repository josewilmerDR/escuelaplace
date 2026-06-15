import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Route-level skeleton for /schools: without it, clicking through to the school directory
 * freezes the current page until the listing's SSR Firestore reads finish. Mirrors the page's
 * layout (listing column, the muted description header — no big title or icon tile — the
 * filter/sort toolbar, then the 1/2/3-column grid of SchoolCard) so the real content swaps
 * in without a jump ("parpadeo").
 *
 * Server component. The whole tree is a live region (`role="status"` + sr-only text) so
 * assistive tech announces the load; the decorative placeholders are `aria-hidden`. Mirrors
 * the a11y pattern and placeholder palette of the sibling app/category/[id]/loading.tsx and
 * app/search/loading.tsx — bg-border (not bg-surface) so the bars read against the white
 * listing canvas. These sibling skeletons should not drift from one another.
 */
export default function LoadingSchoolsPage() {
  return (
    <PageContainer variant="listing">
      <div role="status">
        <span className="sr-only">Cargando escuelas…</span>

        <div aria-hidden="true">
          {/* Header: the page has no big title or icon tile — just the muted description
              (text-sm), a sentence that wraps to ~2 lines, so reserve two thin bars. */}
          <header className="mb-8">
            <div className="h-4 w-full max-w-md animate-pulse rounded bg-border" />
            <div className="mt-2 h-4 w-2/3 max-w-sm animate-pulse rounded bg-border" />
          </header>

          {/* Filter/sort toolbar placeholder: the page renders the directory's filter input
              + "Ordenar por cercanía" button here before the grid (a row on ≥sm, stacked on
              phones), so reserve that height to keep loading→loaded from jumping. */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="h-10 flex-1 animate-pulse rounded-lg bg-border" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-border sm:w-52" />
          </div>

          {/* Card grid: same columns/gap as the directory feed (a <ul role="list"> of
              SchoolCards). Each placeholder mirrors a SchoolCard — a full-height flex column
              (so cards in a row match height), shadow-sm so it doesn't "lift" when the real
              card swaps in, aspect-video cover on top, then an avatar + text block. */}
          <ul role="list" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                  <div className="aspect-video w-full animate-pulse bg-border" />
                  <div className="flex flex-1 gap-3 p-4">
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-border" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-border" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-border" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-border" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageContainer>
  );
}
