import Link from "next/link";
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
 */
export function PageTypeChoice() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/panel/new/business"
        className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-md hover:ring-brand/30"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-brand-darker ring-1 ring-inset ring-brand-dark/10">
          <TagIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          Comercio
        </h2>
        <p className="mt-1 text-sm text-muted">
          Mostrá tu negocio, tus ofertas y la escuela que apoyás.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-darker transition-colors group-hover:text-brand-darkest">
          Crear comercio <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>

      <Link
        href="/panel/new/school"
        className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-md hover:ring-brand/30"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-brand-darker ring-1 ring-inset ring-brand-dark/10">
          <AcademicCapIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          Escuela
        </h2>
        <p className="mt-1 text-sm text-muted">
          Creá la página de tu escuela. Se publica como “sin verificar” hasta que
          el equipo la apruebe.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-darker transition-colors group-hover:text-brand-darkest">
          Crear escuela <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}
