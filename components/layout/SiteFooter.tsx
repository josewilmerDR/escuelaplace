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
    </footer>
  );
}
