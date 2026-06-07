import Link from "next/link";

/**
 * Onboarding choice (/panel/new): a signed-in user picks what kind of page to create,
 * Facebook-style. The choice routes to the matching creation form.
 */
export default function NewPageChoice() {
  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">¿Qué querés crear?</h1>
      <p className="mt-2 text-gray-600">
        Tu cuenta puede administrar varias páginas. Elegí el tipo para empezar.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/panel/new/business"
          className="rounded-lg border p-5 hover:border-black"
        >
          <h2 className="font-semibold">Comercio</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mostrá tu negocio, tus ofertas y la escuela que apoyás.
          </p>
        </Link>

        <Link
          href="/panel/new/school"
          className="rounded-lg border p-5 hover:border-black"
        >
          <h2 className="font-semibold">Escuela</h2>
          <p className="mt-1 text-sm text-gray-600">
            Creá la página de tu escuela. Se publica como “sin verificar” hasta
            que el equipo la apruebe.
          </p>
        </Link>
      </div>
    </main>
  );
}
