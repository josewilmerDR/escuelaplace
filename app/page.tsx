import Link from "next/link";

/**
 * Home (/). Componente de servidor — renderiza en servidor para SEO.
 * Aquí irán: hero, selector de escuela (lee/escribe localStorage en un componente
 * cliente), categorías destacadas y comercios cercanos.
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">escuelaplace</h1>
      <p className="mt-4 max-w-2xl text-lg text-gray-600">
        Directorio comunitario que conecta comercios locales con escuelas de
        Costa Rica. Navegá el catálogo sin registrarte.
      </p>

      <nav className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/categoria/ejemplo">
          Ver categorías
        </Link>
        <Link className="underline" href="/escuela/ejemplo">
          Ver una escuela
        </Link>
        <Link className="underline" href="/comercio/ejemplo">
          Ver un comercio
        </Link>
        <Link className="underline" href="/panel">
          Panel del comercio
        </Link>
      </nav>
    </main>
  );
}
