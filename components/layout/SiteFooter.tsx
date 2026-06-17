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

        {/* Each link carries a real ≥44px touch target (inline-flex min-h-11) with a slight
            horizontal pad pulled back by -mx-1 so the visual spacing is unchanged. */}
        <nav aria-label="Pie de página">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0 sm:gap-y-1">
            <li>
              <Link
                href="/about"
                className="inline-flex min-h-11 items-center px-1 -mx-1 hover:text-brand-darker active:text-brand-darker"
              >
                Cómo funciona
              </Link>
            </li>
            <li>
              <Link
                href="/schools"
                className="inline-flex min-h-11 items-center px-1 -mx-1 hover:text-brand-darker active:text-brand-darker"
              >
                Escuelas
              </Link>
            </li>
            <li>
              <Link
                href="/categories"
                className="inline-flex min-h-11 items-center px-1 -mx-1 hover:text-brand-darker active:text-brand-darker"
              >
                Categorías
              </Link>
            </li>
            <li>
              <Link
                href="/create"
                className="inline-flex min-h-11 items-center px-1 -mx-1 hover:text-brand-darker active:text-brand-darker"
              >
                Crear una página
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
