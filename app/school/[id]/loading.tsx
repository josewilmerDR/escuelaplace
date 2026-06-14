import { PageContainer } from "@/components/layout/PageContainer";
import { ProfileHeaderSkeleton } from "@/components/layout/ProfileHeaderSkeleton";
import { Section } from "@/components/ui/Section";

/**
 * Route-level skeleton for /school/[id]: without it, clicking a school freezes the current
 * page until the profile's four SSR Firestore reads finish. Mirrors the page's calm-depth
 * layout (gray canvas, header card with cover + overlapping avatar + identity + CTA + tabs,
 * then the always-present "Información" and "Comercios" section cards) so the real content
 * replaces it without jumping ("parpadeo"). The header is delegated to ProfileHeaderSkeleton,
 * which keeps the cover aspect/gradient, avatar overlap, radius and `pb-4` body padding in
 * sync with the real ProfileHeader; the section cards render through the same Section
 * primitive the page uses.
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
          <ProfileHeaderSkeleton>
            {/* Trust chips (recent supporters / confirmation time) — rounded-full pills. */}
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <div className="h-7 w-56 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
            </div>

            {/* "Donar" CTA + outline actions — rounded-xl to match the .btn radius. */}
            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <div className="h-12 w-60 animate-pulse rounded-xl bg-brand-tint" />
              <div className="h-12 w-40 animate-pulse rounded-xl bg-surface ring-1 ring-black/5" />
            </div>

            {/* SectionTabs row: a rounded-full chip per anchored section. */}
            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
              <div className="h-8 w-24 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
              <div className="h-8 w-24 animate-pulse rounded-full bg-surface ring-1 ring-black/5" />
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

          {/* Comercios section: the page ALWAYS renders this too (school/page.tsx 346-361),
              so a second card placeholder keeps loading→loaded from jumping. */}
          <Section ariaLabel="Cargando comercios">
            <div className="h-6 w-48 animate-pulse rounded bg-brand-tint" />
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
              <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
              <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
            </div>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}
