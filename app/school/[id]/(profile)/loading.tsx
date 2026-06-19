import { Section } from "@/components/ui/Section";

/**
 * Section-level skeleton for the school profile's tab pages. The shared (profile) layout
 * (header + tabs) stays mounted while switching tabs, so this fallback only needs to stand
 * in for the changing section body — a single card placeholder — not the whole page. (The
 * full-page skeleton for the FIRST entry into a school, when the layout itself is still
 * loading, lives one level up at app/school/[id]/loading.tsx.)
 *
 * Server component; live region so assistive tech announces the load.
 */
export default function LoadingSchoolSection() {
  return (
    <div role="status">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true">
        <Section>
          <div className="h-7 w-48 animate-pulse rounded bg-brand-tint" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="h-72 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
            <div className="h-72 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
            <div className="h-72 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          </div>
        </Section>
      </div>
    </div>
  );
}
