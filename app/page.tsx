import Image from "next/image";
import Link from "next/link";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { HomeSchools, type SupportingBusinessCard } from "@/components/feed/HomeSchools";
import { CatalogTabs } from "@/components/layout/CatalogTabs";
import { SearchBar } from "@/components/search/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartIcon, WarningIcon } from "@/components/ui/icons";
import {
  getSchoolIdsWithActiveProject,
  getSchoolsCached,
  getTopSupportingBusinesses,
  rankSchoolsByRelevance,
  toBusinessCardData,
  toSchoolCardData,
} from "@/lib/firestore";
import type { SchoolCardData } from "@/types";

// Bound the schools candidate pool shipped to the client: the directory shows the top of it,
// the rest are the proximity re-rank pool when the buyer sets a location. Paginate/raise as the
// catalog grows (same note as DIRECTORY_LIMIT on /schools).
const SCHOOL_CANDIDATES = 24;

/**
 * Home (/) — the school DIRECTORY. Server component, rendered on the server for SEO. Leads with
 * a vertical feed of school "posts" (ranked by community support, re-ranked client-side by the
 * buyer's community), with the supporting-businesses carousel pinned at slot 3 (between the 2nd
 * and 3rd school). The full business catalog lives one tab away at /businesses (<CatalogTabs>).
 *
 * ISR: re-render the baseline (support order) every 5 minutes so SEO stays fresh as the ranking
 * changes, without a Firestore read per request. Per-buyer personalization happens client-side.
 */
export const revalidate = 300;

export default async function HomePage() {
  // Schools ranked by community support (rankSchoolsByRelevance with no location = activity
  // baseline), SEO-visible. Empty vs error are different states: a failed read gets a retry
  // message, genuinely-empty gets an onboarding CTA.
  let schoolCards: SchoolCardData[] = [];
  let loadFailed = false;
  try {
    const schools = await getSchoolsCached();
    const activeProjectSchoolIds = await getSchoolIdsWithActiveProject().catch(
      () => new Set<string>(),
    );
    schoolCards = rankSchoolsByRelevance(
      schools.map((s) =>
        toSchoolCardData(s, { hasActiveProject: activeProjectSchoolIds.has(s.id) }),
      ),
      {},
    )
      .slice(0, SCHOOL_CANDIDATES)
      .map((r) => r.school);
  } catch {
    loadFailed = true;
  }

  // Top businesses by support breadth (# distinct schools each supports), pinned as the carousel
  // at slot 3 of the directory. Community-independent, so computed here on the server (SEO-visible)
  // and degrades to nothing until businesses start confirming support. Best-effort.
  let supportingBusinessCards: SupportingBusinessCard[] = [];
  try {
    supportingBusinessCards = (await getTopSupportingBusinesses(10)).map((r) => ({
      business: toBusinessCardData(r.business),
      supportedSchools: r.supportedSchools,
    }));
  } catch {}

  return (
    <main>
      {/* Catalog section switch, pinned just under the top bar (above the hero) so switching
          between the school directory and the business catalog is always one tap away. */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-6">
          <CatalogTabs active="schools" />
        </div>
      </section>

      {/* Hero: a community/school photo tinted with the brand color.
          Layers (back to front):
            1. photo via next/image (responsive + modern formats + preload: it is the LCP
               element — as a raw CSS background it shipped 1.3 MB unoptimized). The section's
               bg-brand still shows while it loads or if the file is missing — graceful fallback.
            2. brand gradient with mix-blend-multiply → duotone "celeste" tint over any photo.
            3. darker brand fade at the bottom for legibility + to blend into the section below.
          The <h1> is real DOM text, so SEO is unaffected by the background. */}
      <section className="relative isolate overflow-hidden bg-brand">
        <Image
          src="/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-br from-brand/85 to-brand-darker/90 mix-blend-multiply"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-t from-white/15 to-transparent"
          aria-hidden
        />

        <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
          {/* The home now leads with the school directory, so the headline names both halves of
              the relationship: the schools and the businesses that sustain them. */}
          <h1 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-4xl">
            La escuela de tu comunidad y los comercios que la apoyan
          </h1>

          {/* No autoFocus: this is the SEO landing page — stealing focus on load pops the mobile
              keyboard over the hero and skips the h1 for screen readers. */}
          <div className="mx-auto mt-10 max-w-2xl">
            <SearchBar />
          </div>

          {/* Quiet explainer link under the search: a translucent pill so it stays legible over
              any part of the photo without competing with the search affordance. */}
          <p className="mt-5">
            <Link
              href="/about"
              className="inline-flex items-center rounded-full bg-black/25 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/35"
            >
              ¿Cómo funciona escuelaplace?
            </Link>
          </p>
        </div>
      </section>

      {/* School directory: a vertical feed of school posts (ranked by support, re-ranked by the
          buyer's community client-side), with the supporting-businesses carousel at slot 2. It
          is led by the community picker — the buyer's single most important decision — using the
          one prominent card already shown on /search, /schools and the category listings. This
          replaces the old faint two-link BuyerStrip that buried that choice; the picker's own
          description line still states what the home is FOR before the feed (the product breaks
          marketplace expectations, so it has to). */}
      <section className="mx-auto max-w-2xl px-6 pt-8 pb-20">
        <CommunityPicker />
        <div>
          {loadFailed ? (
            <EmptyState
              icon={<WarningIcon className="h-7 w-7" />}
              title="No pudimos cargar las escuelas"
              description="Recarga la página para intentarlo de nuevo."
            />
          ) : schoolCards.length === 0 ? (
            <EmptyState
              icon={<HeartIcon className="h-7 w-7" />}
              title="Todavía no hay escuelas publicadas"
              description="Sé la primera institución en sumarse: registra tu escuela y empieza a recibir el apoyo de tu comunidad."
              cta={{ label: "Registra tu escuela", href: "/create" }}
            />
          ) : (
            <HomeSchools
              initial={schoolCards}
              supportingBusinesses={supportingBusinessCards}
            />
          )}
        </div>
      </section>
    </main>
  );
}
