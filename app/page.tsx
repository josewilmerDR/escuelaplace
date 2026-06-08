import Link from "next/link";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SearchBar } from "@/components/search/SearchBar";
import { getTopBusinesses, toBusinessCardData } from "@/lib/firestore";
import type { BusinessCardData } from "@/types";

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
  let cards: BusinessCardData[] = [];
  try {
    cards = (await getTopBusinesses(24)).map(toBusinessCardData);
  } catch {
    // Catalog/Firebase unavailable (e.g. missing env at build) — render without the feed.
  }

  return (
    <>
      <SiteHeader />

      {/* Hero: a community/school photo tinted with the brand color.
          Layers (back to front):
            1. photo (decorative CSS background; base brand color so it still
               looks right if /public/hero.jpg is missing — graceful fallback).
            2. brand gradient with mix-blend-multiply → duotone "celeste" tint
               over any photo, keeping brand cohesion.
            3. darker brand fade at the bottom for text legibility + to blend
               into the white section below.
          The <h1> is real DOM text, so SEO is unaffected by the background. */}
      <section className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 -z-20 bg-brand bg-cover bg-center"
          style={{ backgroundImage: "url('/hero.jpg')" }}
          aria-hidden
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
          <h1 className="mx-auto max-w-xl text-2xl font-medium tracking-tight text-white drop-shadow-sm sm:text-3xl">
            Las personas y comercios que apoyan a tus instituciones educativas
            favoritas
          </h1>

          <div className="mt-8">
            <SearchBar autoFocus />
          </div>        </div>
      </section>

      {/* How ranking works: the three-tier logic, made visible. */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          Resultados que priorizan a tu comunidad
        </h2>

        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {TIERS.map((tier, i) => (
            <li
              key={tier.title}
              className="rounded-2xl border border-border bg-surface p-6"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{tier.title}</h3>
              <p className="mt-2 text-sm text-muted">{tier.body}</p>
            </li>
          ))}
        </ol>

        <nav className="mt-12 flex flex-wrap justify-center gap-4 text-sm">
          <Link className="font-medium text-brand-dark hover:underline" href="/category/ejemplo">
            Ver categorías
          </Link>
          <Link className="font-medium text-brand-dark hover:underline" href="/school/ejemplo">
            Ver una escuela
          </Link>
          <Link className="font-medium text-brand-dark hover:underline" href="/panel">
            Crear página de comercio
          </Link>
        </nav>
      </section>

      {/* Explore feed: SSR baseline order (stored ranking.score), re-ranked client-side
          per the buyer's community. */}
      {cards.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-900">
            Comercios que apoyan
          </h2>
          <CommunityPicker />
          <RankedFeed initial={cards} />
        </section>
      )}
    </>
  );
}

const TIERS = [
  {
    title: "Apoyan a tu escuela",
    body: "Comercios relevantes a tu búsqueda que donan a la escuela que elegiste. Aparecen de primero.",
  },
  {
    title: "Apoyan a otras escuelas",
    body: "También donan a la comunidad, aunque a otra institución. Tu compra sigue ayudando.",
  },
  {
    title: "Relevantes sin donación",
    body: "Coinciden con lo que buscás pero todavía no apoyan a ninguna escuela.",
  },
];
