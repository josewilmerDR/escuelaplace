import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";

/**
 * The "what do you want to create?" choice: the two kinds of page an account can own.
 * Presentational and server-safe (no client hooks) — shared by the public onboarding page
 * (/create) and the in-panel choice (/panel/new) so both entry points stay in sync.
 *
 * Both links land in the panel (auth-gated): an anonymous visitor coming from /create gets
 * the Google sign-in prompt first, then the matching creation form.
 */
export function PageTypeChoice() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/panel/new/business"
        className="group rounded-2xl border border-border bg-white p-6 transition-colors hover:border-brand-dark"
      >
        <span aria-hidden className="text-3xl">
          🏪
        </span>
        <h2 className="mt-3 text-lg font-semibold text-foreground">Comercio</h2>
        <p className="mt-1 text-sm text-muted">
          Mostrá tu negocio, tus ofertas y la escuela que apoyás.
        </p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-darker group-hover:underline">
          Crear comercio <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>

      <Link
        href="/panel/new/school"
        className="group rounded-2xl border border-border bg-white p-6 transition-colors hover:border-brand-dark"
      >
        <span aria-hidden className="text-3xl">
          🏫
        </span>
        <h2 className="mt-3 text-lg font-semibold text-foreground">Escuela</h2>
        <p className="mt-1 text-sm text-muted">
          Creá la página de tu escuela. Se publica como “sin verificar” hasta que
          el equipo la apruebe.
        </p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-darker group-hover:underline">
          Crear escuela <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}
