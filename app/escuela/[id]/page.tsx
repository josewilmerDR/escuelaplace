import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEscuelaPorId, getComerciosPorEscuela } from "@/lib/firestore";

/**
 * Página pública de una escuela: /escuela/[id]
 * SSR para SEO. Muestra la escuela y los comercios que la apoyan, ordenados por
 * ranking.score. La escuela NO tiene cuenta autoadministrada (la gestiona admin).
 * Los datos sensibles (SINPE) viven en subcolección privada y NO se leen aquí.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const escuela = await getEscuelaPorId(id);
  if (!escuela) return { title: "Escuela no encontrada" };
  return {
    title: escuela.nombre,
    description: escuela.descripcion,
  };
}

export default async function EscuelaPage({ params }: Props) {
  const { id } = await params;
  const escuela = await getEscuelaPorId(id);
  if (!escuela) notFound();

  const comercios = await getComerciosPorEscuela(id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{escuela.nombre}</h1>
      <p className="mt-4 text-gray-700">{escuela.descripcion}</p>

      <h2 className="mt-10 text-xl font-semibold">
        Comercios que la apoyan ({comercios.length})
      </h2>
      <ul className="mt-4 space-y-2">
        {comercios.map((c) => (
          <li key={c.id}>
            <a className="underline" href={`/comercio/${c.slug}`}>
              {c.nombre}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
