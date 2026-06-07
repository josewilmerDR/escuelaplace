import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoriaPorId, getComerciosPorCategoria } from "@/lib/firestore";

/**
 * Listado público por categoría: /categoria/[id]
 * SSR para SEO. Comercios de la categoría ordenados por ranking.score.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const categoria = await getCategoriaPorId(id);
  if (!categoria) return { title: "Categoría no encontrada" };
  return { title: categoria.nombre };
}

export default async function CategoriaPage({ params }: Props) {
  const { id } = await params;
  const categoria = await getCategoriaPorId(id);
  if (!categoria) notFound();

  const comercios = await getComerciosPorCategoria(id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{categoria.nombre}</h1>
      <ul className="mt-6 space-y-2">
        {comercios.map((c) => (
          <li key={c.id}>
            <a className="underline" href={`/comercio/${c.slug}`}>
              {c.nombre}
            </a>{" "}
            <span className="text-sm text-gray-500">— {c.escuelaNombre}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
