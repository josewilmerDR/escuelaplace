import { PageContainer } from "@/components/layout/PageContainer";
import { cardClass } from "@/components/ui/Card";

/**
 * Route-level loading skeleton for /school/[id]/project/[pid].
 * Mirrors the real page's layout (detail canvas, white article card with cover, title,
 * inset progress panel — bar, figures row, CTA + disclaimer copy — and stage blocks) so
 * the navigation from a project card stays smooth while the two Firestore reads resolve.
 * Routes through PageContainer/cardClass (like the sibling school/business skeletons) so
 * the canvas width and the card elevation can't drift from the design system.
 * Server component; placeholders are purely decorative (aria-hidden), with an sr-only status.
 */
export default function Loading() {
  return (
    <PageContainer variant="detail">
      <div role="status">
        <span className="sr-only">Cargando proyecto…</span>

        <div aria-hidden="true">
          {/* Back-link — text-sm line height (the real link's py-2/-my-2 cancels for layout). */}
          <div className="h-5 w-40 animate-pulse rounded bg-surface ring-1 ring-black/5" />

          <article className={`mt-3 overflow-hidden ${cardClass("elevated", false)}`}>
            {/* Cover */}
            <div className="aspect-video w-full animate-pulse bg-brand-tint sm:aspect-[5/2]" />

            <div className="p-5 sm:p-8">
              {/* Title + status */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-9 w-2/3 animate-pulse rounded bg-surface ring-1 ring-black/5" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
              </div>

              {/* Description */}
              <div className="mt-3 space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-surface ring-1 ring-black/5" />
              </div>

              {/* Inset progress panel — mirrors ProjectProgress order: the bar first, then
                  the figures row below it, then the CTA and its disclaimer copy. */}
              <div className="mt-6 rounded-2xl bg-surface p-5 ring-1 ring-black/5">
                {/* Progress bar — h-2.5 surface track with inset ring, like ProjectProgress. */}
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-black/5">
                  <div className="h-full w-2/5 animate-pulse rounded-full bg-brand-tint" />
                </div>
                {/* Figures row (raised / goal · contributors) — below the bar. */}
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
                  <div className="h-4 w-40 animate-pulse rounded bg-white ring-1 ring-black/5" />
                  <div className="h-4 w-28 animate-pulse rounded bg-white ring-1 ring-black/5" />
                </div>
                {/* CTA */}
                <div className="mt-4 h-12 w-56 animate-pulse rounded-xl bg-brand-tint" />
                {/* CTA disclaimer copy (two muted paragraphs). */}
                <div className="mt-2 space-y-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-white ring-1 ring-black/5" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white ring-1 ring-black/5" />
                </div>
              </div>

              {/* Stages */}
              <section className="mt-8">
                <div className="h-6 w-56 animate-pulse rounded bg-brand-tint" />
                <div className="mt-1 h-4 w-3/4 animate-pulse rounded bg-surface ring-1 ring-black/5" />

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
        </div>
      </div>
    </PageContainer>
  );
}
