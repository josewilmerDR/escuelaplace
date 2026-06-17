import Link from "next/link";
import { cardClass } from "@/components/ui/Card";
import { IconTile } from "@/components/ui/IconTile";
import { AcademicCapIcon, ArrowRightIcon, TagIcon } from "@/components/ui/icons";

/**
 * The "what do you want to create?" choice: the two kinds of page an account can own.
 * Presentational and server-safe (no client hooks) — shared by the public onboarding page
 * (/create) and the in-panel choice (/panel/new) so both entry points stay in sync.
 *
 * Both links land in the panel (auth-gated): an anonymous visitor coming from /create gets
 * the Google sign-in prompt first, then the matching creation form.
 *
 * A classic Apple "choose your path" screen: two big tappable calm-depth cards, each led by
 * a rounded app-icon tile (the same glyphs the panel home uses for each page type — tag for
 * comercios, mortarboard for escuelas), lifting on hover.
 *
 * `headingLevel` sets the card title tag so each host keeps a correct heading hierarchy:
 * default "h2" on /panel/new (where the page h1 is "¿Qué querés crear?"), "h3" on /create
 * (where a section "¿Qué querés crear?" h2 precedes the cards).
 */
export function PageTypeChoice({
  headingLevel = "h2",
}: {
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/panel/new/business"
        aria-label="Crear página de comercio"
        className={`group ${cardClass("elevated")} transition hover:shadow-md hover:ring-2 hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]`}
      >
        <IconTile size="md">
          <TagIcon className="h-6 w-6" />
        </IconTile>
        <Heading className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          Comercio
        </Heading>
        <p className="mt-1 text-sm text-muted">
          Mostrá tu negocio, tus ofertas y la escuela que apoyás. Se crea como
          borrador hasta que lo publiques.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-darker transition-colors group-hover:text-brand-darkest">
          Crear comercio <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>

      <Link
        href="/panel/new/school"
        aria-label="Crear página de escuela"
        className={`group ${cardClass("elevated")} transition hover:shadow-md hover:ring-2 hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]`}
      >
        <IconTile size="md">
          <AcademicCapIcon className="h-6 w-6" />
        </IconTile>
        <Heading className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          Escuela
        </Heading>
        <p className="mt-1 text-sm text-muted">
          Creá la página de tu escuela. Se publica como <strong>sin verificar</strong> hasta que
          el equipo la apruebe.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-darker transition-colors group-hover:text-brand-darkest">
          Crear escuela <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}
