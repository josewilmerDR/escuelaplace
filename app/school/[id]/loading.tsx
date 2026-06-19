import { PageContainer } from "@/components/layout/PageContainer";
import { ProfileHeaderSkeleton } from "@/components/layout/ProfileHeaderSkeleton";
import { Section } from "@/components/ui/Section";

/**
 * First-entry skeleton for /school/[id]: without it, clicking a school freezes the current
 * page until the profile layout's SSR Firestore reads finish. It wraps the shared (profile)
 * layout, so it stands in for the WHOLE profile on first entry (header + landing section);
 * once inside, switching tabs is covered by the lighter section-only skeleton at
 * app/school/[id]/(profile)/loading.tsx. Mirrors the calm-depth layout (gray canvas, header
 * card with cover + overlapping avatar + identity + CTA + tabs, then the landing
 * "Información" card). The header is delegated to ProfileHeaderSkeleton, which keeps the
 * cover aspect/gradient, avatar overlap, radius and `pb-4` body padding in sync with the
 * real ProfileHeader; the section card renders through the same Section primitive the page
 * uses.
 *
 * It models only what the landing always renders (header + "Información"). It deliberately
 * does NOT reserve space for conditional pieces — the unverified banner, the section-specific
 * content — because their presence depends on SSR data unknown at skeleton time, so a fixed
 * placeholder would more often mislead than match; the trust chips are likewise only a
 * best-effort guess (the page hides them entirely when there are no supporters yet).
 *
 * Server component. The whole tree is a live region (`role="status"` + sr-only text) so
 * assistive tech announces the load; the decorative placeholders are `aria-hidden`.
 */
export default function LoadingSchoolPage() {
  return (
    <PageContainer variant="detail">
      <div role="status">
        <span className="sr-only">Cargando escuela…</span>

        <div aria-hidden="true">
          <ProfileHeaderSkeleton metaLines={1}>
            {/* Trust chips (recent supporters / confirmation time) — rounded-full pills.
                The page can render up to two StatChips, so reserve two. */}
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <div className="h-7 w-56 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
              <div className="h-7 w-44 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
            </div>

            {/* "Donar" CTA + outline actions — rounded-xl to match the .btn radius. The
                primary CTA is px-8 py-3 text-base (~48px); the outline is the default .btn
                (min-h-10, i.e. 40px). */}
            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <div className="h-12 w-60 animate-pulse rounded-xl bg-brand-tint" />
              <div className="h-10 w-40 animate-pulse rounded-xl bg-surface ring-1 ring-black/5" />
            </div>

            {/* Disclaimer line the page always renders under the CTA (page.tsx). */}
            <div className="mt-2 space-y-1">
              <div className="h-3 w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-surface ring-1 ring-black/5" />
            </div>

            {/* ProfileTabs row: the real strip is a bordered tab bar (border-t + rounded-lg
                tabs), not rounded-full chips — mirror it so the swap doesn't flash. */}
            <div className="-mx-2 mt-5 flex justify-center gap-1 border-t border-border pt-1 sm:justify-start">
              <div className="h-9 w-24 animate-pulse rounded-lg bg-surface" />
              <div className="h-9 w-20 animate-pulse rounded-lg bg-surface" />
            </div>
          </ProfileHeaderSkeleton>

          {/* Información: the landing section the index page renders. */}
          <Section>
            <div className="h-7 w-32 animate-pulse rounded bg-brand-tint" />
            <div className="mt-3 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-surface ring-1 ring-black/5" />
            </div>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}
