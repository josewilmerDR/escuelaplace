import Image from "next/image";
import Link from "next/link";
import { CommunityStep } from "@/components/buyer/CommunityStep";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { SearchBar } from "@/components/search/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { StepTile } from "@/components/ui/StepTile";
import {
  HeartIcon,
  SearchIcon,
  TagIcon,
  WarningIcon,
} from "@/components/ui/icons";
import {
  getCategories,
  getTopBusinesses,
  toBusinessCardData,
} from "@/lib/firestore";
import type { BusinessCardData, CategoryDoc } from "@/types";

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

        <div className="mx-auto max-w-3xl px-6 py-12 text-center sm:py-28">
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
          compra" steps on /about; the secondary CTAs also surface /schools and /about,
          which are otherwise only reachable from the header/footer. */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-8 sm:py-10">
          <ol className="relative mx-auto grid max-w-4xl gap-3 sm:grid-cols-3 sm:gap-6">
            {/* Stepper connector: a faint line linking the three icon centers so the
                steps read as a 1→2→3 flow, not three independent items. Desktop only
                (the mobile layout is a vertical row where the numbers carry the order).
                top-6 = the h-12 icon's vertical center; insets stop at the outer icons. */}
            <span
              aria-hidden
              className="absolute left-[16.6%] right-[16.6%] top-6 hidden h-px bg-border sm:block"
            />
            {/* Step 1 is interactive (picks the buyer's community → drives the feed),
                so it's a client component; steps 2–3 stay static SSR. */}
            <CommunityStep />
            <BuyerStep
              step={2}
              icon={<SearchIcon className="h-5 w-5" />}
              title="Descubrí los comercios que la apoyan"
            />
            <BuyerStep
              step={3}
              icon={<HeartIcon className="h-5 w-5" />}
              title="Comprá en ellos y apoyá tu institución"
            />
          </ol>
        </div>
      </section>

      {/* Explore feed: SSR baseline order (stored ranking.score), re-ranked client-side
          per the buyer's community. The picker renders regardless of the feed state so
          the buyer can set their school even when there is nothing to list yet. */}
      <section className="mx-auto max-w-6xl px-6 pt-4 pb-20">
        {categories.length > 0 && (
          /* On mobile the chips scroll horizontally on a single line (a native pill rail) so
             every category stays reachable — clipping them to one row hid almost all of them
             on a phone, the buyer's main no-search browse path. From sm up the row reverts to
             the desktop behavior: clipped to one wrapped line (max-h = 20px line + 20px padding
             + 2px border). "Todas las categorías" sits outside the list so it's always visible
             at the end. The scrollbar is hidden (the overflow itself signals more content). */
          <nav aria-label="Categorías" className="mb-4 flex items-start gap-2">
            <ul className="flex min-w-0 flex-1 flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] sm:max-h-[42px] sm:flex-wrap sm:overflow-hidden [&::-webkit-scrollbar]:hidden">
              {categories.map((c) => (
                <li key={c.id} className="shrink-0">
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
          <RankedFeed initial={cards} />
        )}
      </section>
      </main>
    </>
  );
}

/** A buyer "how it works" step on the home value strip: numbered icon tile + title + line.
 *  The number badge + the connector line behind the icons (see <ol> above) make the three
 *  read as an ordered flow. Compact: a horizontal row on mobile (icon left, text right) to
 *  keep the strip short; recenters into a column on the 3-up grid (sm+). */
function BuyerStep({
  step,
  icon,
  title,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 text-left sm:flex-col sm:items-center sm:text-center">
      <StepTile step={step}>{icon}</StepTile>
      <div className="min-w-0 sm:mt-3">
        <h3 className="font-semibold tracking-tight text-foreground">{title}</h3>
        {children && (
          <p className="mt-0.5 text-sm leading-relaxed text-muted sm:mt-1">{children}</p>
        )}
      </div>
    </li>
  );
}
