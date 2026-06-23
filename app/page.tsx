import Image from "next/image";
import Link from "next/link";
import { BuyerStrip } from "@/components/buyer/BuyerStrip";
import { HomeSchools, type SupportingBusinessCard } from "@/components/feed/HomeSchools";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { SearchBar } from "@/components/search/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { TagIcon, WarningIcon } from "@/components/ui/icons";
import {
  getCategories,
  getSchoolIdsWithActiveProject,
  getSchoolsCached,
  getTopBusinesses,
  getTopSupportingBusinesses,
  rankSchoolsByRelevance,
  toBusinessCardData,
  toSchoolCardData,
} from "@/lib/firestore";
import type { BusinessCardData, CategoryDoc, SchoolCardData } from "@/types";

// Bound the schools candidate pool shipped to the client: the block shows 3, the rest are the
// proximity re-rank pool when the buyer sets a location. Paginate/raise as the catalog grows
// (same note as DIRECTORY_LIMIT on /schools).
const SCHOOL_CANDIDATES = 24;

/**
 * Home (/). Server component — rendered on the server for SEO.
 * Hero with a single search field (encuentra24 style, but no location field:
 * the buyer's school lives in localStorage and drives ranking server-side).
 *
 * The explore feed is rendered SSR in baseline order (stored `ranking.score`); the
 * <ExploreFeed> client component re-ranks it per the buyer's community after mount.
 */
/**
 * ISR: re-render the baseline (stored ranking.score order) every 5 minutes so SEO stays
 * fresh as scores change, without paying a Firestore read on every request. Per-user
 * personalization happens client-side in <ExploreFeed>.
 */
export const revalidate = 300;

export default async function HomePage() {
  // Empty and error are different states for the user: "no businesses yet" gets an
  // onboarding CTA, "catalog unavailable" (e.g. Firebase down / missing env at build)
  // gets a retry message. Don't collapse them into a silently missing section.
  let cards: BusinessCardData[] = [];
  let loadFailed = false;
  try {
    cards = (await getTopBusinesses(24)).map(toBusinessCardData);
  } catch {
    loadFailed = true;
  }

  // Category chips are the browse path for buyers who don't know what to search yet.
  // Best-effort enhancement: empty categories are skipped (linking to an empty listing
  // helps no one) and a fetch failure just hides the row.
  let categories: CategoryDoc[] = [];
  try {
    categories = (await getCategories()).filter((c) => c.businessCount > 0);
  } catch {}

  // Schools' presence on the home: a top-3 block interleaved into the business feed, which
  // <HomeSchools> personalizes by the buyer's community after mount. The SSR order is by
  // community support (rankSchoolsByRelevance with no location = activity baseline), so it is
  // SEO-visible. Best-effort: a failed read just omits the block, never blanks the catalog.
  let schoolCards: SchoolCardData[] = [];
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
  } catch {}

  // Top businesses by support breadth (# distinct schools each supports), interleaved into the
  // no-community schools block. Community-independent, so it's computed here on the server
  // (SEO-visible) and degrades to nothing until businesses start confirming support. Best-effort:
  // a failed read just omits the carousel, never blanks the catalog.
  let supportingBusinessCards: SupportingBusinessCard[] = [];
  try {
    supportingBusinessCards = (await getTopSupportingBusinesses(10)).map((r) => ({
      business: toBusinessCardData(r.business),
      supportedSchools: r.supportedSchools,
    }));
  } catch {}

  return (
    <>
      <main>
      {/* Hero: a community/school photo tinted with the brand color.
          Layers (back to front):
            1. photo via next/image (responsive sizes + modern formats + preload: it is
               the LCP element — as a raw CSS background it shipped 1.3 MB unoptimized).
               The section's bg-brand still shows while it loads or if the file is
               missing — graceful fallback.
            2. brand gradient with mix-blend-multiply → duotone "celeste" tint
               over any photo, keeping brand cohesion.
            3. darker brand fade at the bottom for text legibility + to blend
               into the white section below.
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
          {/* Copy promises only what the catalog shows (businesses). "Las personas y
              comercios…" oversold: there are no people profiles in the product. */}
          <h1 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-4xl">
            Los comercios que apoyan a tus instituciones educativas favoritas
          </h1>

          {/* No autoFocus: this is the SEO landing page — stealing focus on load pops
              the mobile keyboard over the hero and skips the h1 for screen readers. */}
          <div className="mx-auto mt-10 max-w-2xl">
            <SearchBar />
          </div>

          {/* Quiet explainer link under the search: a translucent pill so it stays legible
              over any part of the photo without competing with the search affordance. */}
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

      {/* Value strip: the product breaks marketplace expectations (no checkout, the
          platform never touches money), so the home — where most buyers land — has to
          say what the catalog is FOR before showing it. Condensed from the "Para quien
          compra" steps on /about. <BuyerStrip> shows the full 1→2→3 stepper on a first
          visit and collapses to a one-line community summary once a school/zone is set. */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <BuyerStrip />
        </div>
      </section>

      {/* Explore feed: SSR baseline order (stored ranking.score), re-ranked client-side
          per the buyer's community. The picker renders regardless of the feed state so
          the buyer can set their school even when there is nothing to list yet. */}
      <section className="mx-auto max-w-6xl px-6 pt-4 pb-20">
        {categories.length > 0 && (
          /* Single-line row: the list still wraps internally but is clipped to one
             chip row (max-h = 20px line + 20px padding + 2px border), so chips that
             don't fit are simply hidden. "Todas las categorías" sits outside the
             clipped list, so it always stays visible at the end of the line and
             links to the full listing. Pure CSS — no client-side measuring. */
          <nav aria-label="Categorías" className="mb-4 flex items-start gap-2">
            <ul className="flex max-h-[42px] min-w-0 flex-1 flex-wrap gap-2 overflow-hidden">
              {categories.map((c) => (
                <li key={c.id}>
                  <Chip href={`/category/${c.id}`} icon={c.icon}>
                    {c.name}
                  </Chip>
                </li>
              ))}
            </ul>
            <Chip href="/categories" emphasis="brand" className="shrink-0">
              Todas las categorías
            </Chip>
          </nav>
        )}

        {loadFailed ? (
          <EmptyState
            icon={<WarningIcon className="h-7 w-7" />}
            title="No pudimos cargar el catálogo"
            description="Recargá la página para intentarlo de nuevo."
          />
        ) : cards.length === 0 ? (
          <EmptyState
            icon={<TagIcon className="h-7 w-7" />}
            title="Todavía no hay comercios publicados"
            description="Sé el primero en sumarte: creá la página de tu comercio y aparecé en el directorio de tu comunidad."
            cta={{ label: "Creá la página del tuyo", href: "/create" }}
          />
        ) : (
          <RankedFeed
            initial={cards}
            interleave={
              schoolCards.length > 0 ? (
                <HomeSchools
                  initial={schoolCards}
                  supportingBusinesses={supportingBusinessCards}
                />
              ) : undefined
            }
          />
        )}
      </section>
      </main>
    </>
  );
}
