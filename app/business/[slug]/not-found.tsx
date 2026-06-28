import Link from "next/link";

/**
 * 404 for a business that doesn't exist — a mistyped slug, or a page that was unpublished
 * or removed. More specific than the site-wide not-found: it names the entity and points
 * back into the business catalog rather than the generic home. The (profile) layout's
 * `if (!business) notFound()` throws this, and it bubbles here just like the sibling
 * error.tsx. Rendered under the root layout (outside the (profile) group), so the site
 * header still frames it.
 */
export default function BusinessNotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Comercio no encontrado
      </h1>
      <p className="mt-3 text-sm text-muted">
        El enlace puede estar mal escrito, o el comercio ya no está publicado.
      </p>
      <Link href="/businesses" className="btn btn-primary mt-8">
        Ver comercios
      </Link>
    </main>
  );
}
