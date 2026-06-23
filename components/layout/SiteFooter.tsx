import Link from "next/link";

/**
 * Site footer (app shell, rendered once in the root layout). Intentionally
 * minimal: its main job is to make the trust/clarity pages reachable — chiefly
 * /about ("cómo funciona"), which otherwise has no entry point — plus the
 * primary browse routes. Server component, no interactive parts.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 text-sm text-muted sm:flex-row sm:justify-between">
        <Link
          href="/"
          className="flex items-baseline gap-1 text-lg font-bold tracking-tight text-foreground"
        >
          escuela
          <span className="rounded-md bg-brand-dark px-1.5 text-white">
            place
          </span>
        </Link>

        <nav aria-label="Pie de página">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <li>
              <Link href="/about" className="hover:text-brand-darker">
                Cómo funciona
              </Link>
            </li>
            <li>
              <Link href="/schools" className="hover:text-brand-darker">
                Escuelas
              </Link>
            </li>
            <li>
              <Link href="/categories" className="hover:text-brand-darker">
                Categorías
              </Link>
            </li>
            <li>
              <Link href="/create" className="hover:text-brand-darker">
                Crear una página
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      {/* Founding-school credit: escuelaplace was born for Escuela la Cajeta de
          Cutris. A nod to it (school link) plus a "Donar" text action — styled
          like the Cambiar/Limpiar affordances, not a button — straight into its
          donation flow with the school preselected. */}
      <div className="mx-auto max-w-6xl border-t border-border px-6 py-4 text-center text-sm text-muted">
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>
            Con{" "}
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              role="img"
              aria-label="amor"
              className="inline-block h-4 w-4 align-text-bottom text-rose-500"
            >
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.738 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
            </svg>
            ,{" "}
            <Link
              href="/school/LTRWv4vWn9RiynVChkIl"
              className="font-medium text-foreground hover:text-brand-darker"
            >
              Escuela la Cajeta de Cutris
            </Link>
          </span>
          <span aria-hidden>·</span>
          <Link
            href="/panel/donate?schoolId=LTRWv4vWn9RiynVChkIl"
            className="font-medium text-brand-darker hover:underline"
          >
            Donar
          </Link>
        </p>
      </div>
    </footer>
  );
}
