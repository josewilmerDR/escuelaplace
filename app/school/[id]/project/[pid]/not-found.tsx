import Link from "next/link";

/**
 * 404 for a project that doesn't exist — a cancelled/removed project or a wrong link. The
 * project page's `if (!project || !school) notFound()` throws this; it bubbles here like the
 * sibling error.tsx. A not-found boundary receives no params, so it can't link back to the
 * specific school — it points to the school directory instead.
 */
export default function ProjectNotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Proyecto no encontrado
      </h1>
      <p className="mt-3 text-sm text-muted">
        El proyecto pudo cancelarse o eliminarse, o el enlace no es correcto.
      </p>
      <Link href="/schools" className="btn btn-primary mt-8">
        Ver escuelas
      </Link>
    </main>
  );
}
