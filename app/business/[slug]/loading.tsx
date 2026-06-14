import { PageContainer } from "@/components/layout/PageContainer";
import { ProfileHeaderSkeleton } from "@/components/layout/ProfileHeaderSkeleton";
import { Section } from "@/components/ui/Section";

/**
 * Route-level skeleton: without it, clicking a card freezes the current page until the
 * profile's SSR Firestore reads finish. Mirrors the page's calm-depth layout (gray canvas,
 * header card with cover + overlapping avatar + identity, then section cards) so the real
 * content replaces it without jumping ("parpadeo"). The header is delegated to
 * ProfileHeaderSkeleton, which keeps the cover aspect/gradient, avatar overlap, radius and
 * `pb-4` body padding in sync with the real ProfileHeader; the section cards render through
 * the same Section primitive the page uses, so neither half can drift.
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
            {/* SupportBadge pill (page.tsx lines 249-251). */}
            <div className="mt-5 flex justify-center sm:justify-start">
              <div className="h-7 w-44 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
            </div>

            {/* ContactButtons row — rounded-xl to match the .btn radius. */}
            <div className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
              <div className="h-10 w-56 animate-pulse rounded-xl bg-brand-tint" />
              <div className="h-10 w-28 animate-pulse rounded-xl bg-surface ring-1 ring-black/5" />
            </div>

            {/* SectionTabs row: a rounded-full chip per anchored section. */}
            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
              <div className="h-8 w-24 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
              <div className="h-8 w-20 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
            </div>
          </ProfileHeaderSkeleton>

          {/* Información section: the page always renders it. */}
          <Section ariaLabel="Cargando información">
            <div className="h-6 w-32 animate-pulse rounded bg-brand-tint" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-surface ring-1 ring-black/5" />
            </div>
          </Section>

          {/* Reseñas section: the page ALWAYS renders this too (page.tsx 388-401), so a
              second card placeholder keeps loading→loaded from jumping. */}
          <Section ariaLabel="Cargando reseñas">
            <div className="h-6 w-28 animate-pulse rounded bg-brand-tint" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-surface ring-1 ring-black/5" />
            </div>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}
