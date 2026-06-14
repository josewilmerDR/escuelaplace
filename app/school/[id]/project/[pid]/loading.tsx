/**
 * Route-level loading skeleton for /school/[id]/project/[pid].
 * Mirrors the real page's layout (surface bg, max-w-4xl main, white article card with
 * cover, title, inset progress panel, and stage blocks) so the navigation from a project
 * card stays smooth while the two Firestore reads resolve.
 * Server component; placeholders are purely decorative (aria-hidden), with an sr-only status.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-surface" role="status">
      <span className="sr-only">Cargando proyecto…</span>

      <main
        className="mx-auto max-w-4xl px-4 py-6 sm:px-6"
        aria-hidden="true"
      >
        {/* Back-link */}
        <div className="h-4 w-40 animate-pulse rounded bg-brand-tint" />

        <article className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          {/* Cover */}
          <div className="aspect-video w-full animate-pulse bg-brand-tint sm:aspect-[5/2]" />

          <div className="p-5 sm:p-8">
            {/* Title + status */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-9 w-2/3 animate-pulse rounded bg-brand-tint" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-brand-tint" />
            </div>

            {/* Description */}
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-surface ring-1 ring-black/5" />
            </div>

            {/* Inset progress panel */}
            <div className="mt-6 rounded-2xl bg-surface p-5 ring-1 ring-black/5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="h-5 w-28 animate-pulse rounded bg-brand-tint" />
                <div className="h-4 w-24 animate-pulse rounded bg-brand-tint" />
              </div>
              {/* Fake progress bar */}
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white ring-1 ring-black/5">
                <div className="h-full w-2/5 animate-pulse rounded-full bg-brand-tint" />
              </div>
              {/* CTA */}
              <div className="mt-4 h-12 w-56 animate-pulse rounded-xl bg-brand-tint" />
            </div>

            {/* Stages */}
            <section className="mt-8">
              <div className="h-6 w-56 animate-pulse rounded bg-brand-tint" />
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-surface ring-1 ring-black/5" />

              <ol className="mt-5 flex flex-col gap-5">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="rounded-xl bg-surface p-4 ring-1 ring-black/5 sm:p-5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="h-5 w-48 animate-pulse rounded bg-white ring-1 ring-black/5" />
                      <div className="h-5 w-24 animate-pulse rounded bg-white ring-1 ring-black/5" />
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="h-3.5 w-full animate-pulse rounded bg-white ring-1 ring-black/5" />
                      <div className="h-3.5 w-2/3 animate-pulse rounded bg-white ring-1 ring-black/5" />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
