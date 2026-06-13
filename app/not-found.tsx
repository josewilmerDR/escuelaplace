import Link from "next/link";

/**
 * Site-wide 404. Next's default is English-only with no navigation; shared links with a
 * typo (or pages that got unpublished) land here, so it needs the header and a way back
 * into the catalog.
 */
export default function NotFound() {
  return (
    <>
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Página no encontrada
        </h1>
        <p className="mt-3 text-sm text-muted">
          El enlace puede estar mal escrito o la página ya no está publicada.
        </p>
        <Link href="/" className="btn btn-primary mt-8">
          Volver al catálogo
        </Link>
      </main>
    </>
  );
}
