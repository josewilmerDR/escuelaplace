/**
 * Route-level skeleton: without it, clicking a card freezes the current page until the
 * profile's SSR Firestore reads finish. Mirrors the page's calm-depth layout (gray
 * canvas, header card with cover + overlapping avatar + title, then section cards) so
 * the real content replaces it without jumping ("parpadeo").
 */
export default function LoadingBusinessPage() {
  return (
    // Gray canvas + max-w-4xl column to match the loaded page exactly.
    <div className="min-h-screen bg-surface">
      <main aria-busy className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Header card: elevated surface (ring + shadow), cover band, overlapping
            avatar circle, then title/meta placeholders. */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="aspect-video w-full animate-pulse bg-brand-tint sm:aspect-[5/2]" />
          <div className="px-5 pb-5 sm:px-8">
            <div className="flex flex-col items-center sm:flex-row sm:items-end sm:gap-5">
              {/* Avatar overlapping the cover's lower edge, same offsets as the page. */}
              <div className="relative z-10 -mt-14 h-28 w-28 shrink-0 animate-pulse rounded-full bg-slate-200 ring-4 ring-white sm:-mt-16 sm:h-32 sm:w-32" />
              <div className="mt-3 w-full sm:mt-0 sm:flex-1 sm:pb-1">
                <div className="mx-auto h-8 w-2/3 animate-pulse rounded bg-slate-200 sm:mx-0" />
                <div className="mx-auto mt-2 h-4 w-1/3 animate-pulse rounded bg-slate-100 sm:mx-0" />
              </div>
            </div>
            {/* Action buttons row. */}
            <div className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
              <div className="h-10 w-56 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" />
            </div>
          </div>
        </div>

        {/* Información section card. */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
          <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </main>
    </div>
  );
}
