import Link from "next/link";

/**
 * 404 for a school that doesn't exist — a stale link or a page that was removed. More
 * specific than the site-wide not-found: it names the entity and points back into the
 * school directory. The (profile) layout's `if (!school) notFound()` throws this, and it
 * bubbles here just like the sibling error.tsx (also covers the sibling project route, which
 * has its own not-found). Rendered under the root layout, so the site header still frames it.
 */
export default function SchoolNotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Escuela no encontrada
      </h1>
      <p className="mt-3 text-sm text-muted">
        El enlace puede estar mal escrito, o la escuela ya no está publicada.
      </p>
      <Link href="/schools" className="btn btn-primary mt-8">
        Ver escuelas
      </Link>
    </main>
  );
}
