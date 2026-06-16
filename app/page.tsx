import Image from "next/image";
import Link from "next/link";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { SearchBar } from "@/components/search/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconTile } from "@/components/ui/IconTile";
import {
  AcademicCapIcon,
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
        </div>
      </section>

      {/* Value strip: the product breaks marketplace expectations (no checkout, the
          platform never touches money), so the home — where most buyers land — has to
          say what the catalog is FOR before showing it. Condensed from the "Para quien
          compra" steps on /about; the secondary CTAs also surface /schools and /about,
          which are otherwise only reachable from the header/footer. */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Comprá local, sostené tu escuela
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              No es una tienda en línea: es el directorio de los comercios que apoyan a
              las escuelas de tu comunidad. Al preferirlos, tu compra sostiene a la
              escuela de forma indirecta. Navegás sin crear cuenta.
            </p>
          </div>

          <ol className="mx-auto mt-10 grid max-w-4xl gap-8 sm:grid-cols-3">
            <BuyerStep
              icon={<AcademicCapIcon className="h-6 w-6" />}
              title="Elegí tu comunidad"
            >
              Seleccioná tu escuela y tu zona. Se guarda solo en tu navegador para
              ordenar lo que ves.
            </BuyerStep>
            <BuyerStep
              icon={<SearchIcon className="h-6 w-6" />}
              title="Descubrí quién la apoya"
            >
              Buscá por nombre o rubro y mirá los comercios que apoyan a la escuela de
              tu comunidad.
            </BuyerStep>
            <BuyerStep
              icon={<HeartIcon className="h-6 w-6" />}
              title="Comprales y sostenela"
            >
              Al gastar con quienes la apoyan, tu compra sostiene a la institución de
              forma indirecta.
            </BuyerStep>
          </ol>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/schools" className="btn btn-outline">
              Ver escuelas
            </Link>
            <Link href="/about" className="btn btn-secondary">
              Cómo funciona
            </Link>
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

        <CommunityPicker />

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

/** A buyer "how it works" step on the home value strip: icon tile + title + line.
 *  Mirrors the numbered steps on /about, centered for the home's marketing rhythm. */
function BuyerStep({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col items-center text-center">
      <IconTile size="md">{icon}</IconTile>
      <h3 className="mt-4 font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </li>
  );
}
