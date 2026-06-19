import { Section } from "@/components/ui/Section";

/**
 * Section-level skeleton for the business profile's tab pages. The shared (profile) layout
 * (header + tabs) stays mounted while switching tabs, so this fallback only stands in for
 * the changing section body — a single card placeholder — not the whole page. (The full-page
 * skeleton for the FIRST entry into a business, when the layout itself is still loading,
 * lives one level up at app/business/[slug]/loading.tsx.)
 *
 * Server component; live region so assistive tech announces the load.
 */
export default function LoadingBusinessSection() {
  return (
    <div role="status">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true">
        <Section>
          <div className="h-7 w-40 animate-pulse rounded bg-brand-tint" />
          <div className="mt-4 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-surface ring-1 ring-black/5" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-surface ring-1 ring-black/5" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface ring-1 ring-black/5" />
          </div>
        </Section>
      </div>
    </div>
  );
}
