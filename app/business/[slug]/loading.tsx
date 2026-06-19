import { PageContainer } from "@/components/layout/PageContainer";
import { ProfileHeaderSkeleton } from "@/components/layout/ProfileHeaderSkeleton";
import { Section } from "@/components/ui/Section";

/**
 * First-entry skeleton: without it, clicking a card freezes the current page until the
 * profile layout's SSR Firestore reads finish. It wraps the shared (profile) layout, so it
 * stands in for the WHOLE profile on first entry (header + landing "Información" section);
 * once inside, switching tabs is covered by the lighter section-only skeleton at
 * app/business/[slug]/(profile)/loading.tsx. Mirrors the calm-depth layout (gray canvas,
 * header card with cover + overlapping avatar + identity, then the landing section card). The
 * header is delegated to ProfileHeaderSkeleton, which keeps the cover aspect/gradient, avatar
 * overlap, radius and `pb-4` body padding in sync with the real ProfileHeader; the section
 * card renders through the same Section primitive the page uses, so neither half can drift.
 *
 * Server component. The whole tree is a live region (`role="status"` + sr-only text) so
 * assistive tech announces the load; the decorative placeholders are `aria-hidden`.
 */
export default function LoadingBusinessPage() {
  return (
    <PageContainer variant="detail">
      <div role="status">
        <span className="sr-only">Cargando comercio…</span>

        <div aria-hidden="true">
          <ProfileHeaderSkeleton>
            {/* SupportBadge row — mirrors the real SupportBadge root margin (mt-3). */}
            <div className="mt-3 flex justify-center sm:justify-start">
              <div className="h-7 w-44 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
            </div>

            {/* ContactButtons row — rounded-xl to match the .btn radius. */}
            <div className="mt-4 flex flex-wrap justify-center gap-3 sm:justify-start">
              <div className="h-10 w-56 animate-pulse rounded-xl bg-brand-tint" />
              <div className="h-10 w-28 animate-pulse rounded-xl bg-surface ring-1 ring-black/5" />
            </div>

            {/* ProfileTabs row: the real strip is a bordered tab bar (border-t + rounded-lg
                tabs), not rounded-full chips — mirror it so the swap doesn't flash. */}
            <div className="-mx-2 mt-5 flex justify-center gap-1 border-t border-border pt-1 sm:justify-start">
              <div className="h-9 w-24 animate-pulse rounded-lg bg-surface" />
              <div className="h-9 w-20 animate-pulse rounded-lg bg-surface" />
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
