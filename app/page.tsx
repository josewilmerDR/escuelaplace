import Image from "next/image";
import Link from "next/link";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { SearchBar } from "@/components/search/SearchBar";
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

        <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
          {/* Copy promises only what the catalog shows (businesses). "Las personas y
              comercios…" oversold: there are no people profiles in the product. */}
          <h1 className="mx-auto max-w-xl text-2xl font-medium tracking-tight text-white drop-shadow-sm sm:text-3xl">
            Los comercios que apoyan a tus instituciones educativas favoritas
          </h1>

          {/* No autoFocus: this is the SEO landing page — stealing focus on load pops
              the mobile keyboard over the hero and skips the h1 for screen readers. */}
          <div className="mt-8">
            <SearchBar />
          </div>
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
                  <Link
                    href={`/category/${c.id}`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-brand-dark hover:text-brand-darker"
                  >
                    <span aria-hidden>{c.icon}</span>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/categories"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-brand-darker hover:border-brand-dark"
            >
              Todas las categorías
            </Link>
          </nav>
        )}

        <CommunityPicker />

        {loadFailed ? (
          <p className="text-muted">
            No pudimos cargar el catálogo. Recargá la página para intentarlo de
            nuevo.
          </p>
        ) : cards.length === 0 ? (
          <p className="text-muted">
            Todavía no hay comercios publicados.{" "}
            <Link
              href="/create"
              className="font-medium text-brand-darker hover:underline"
            >
              Creá la página del tuyo
            </Link>
            .
          </p>
        ) : (
          <RankedFeed initial={cards} />
        )}
      </section>
      </main>
    </>
  );
}
