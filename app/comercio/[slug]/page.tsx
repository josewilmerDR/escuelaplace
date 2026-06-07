import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getComercioPorSlug } from "@/lib/firestore";

/**
 * Página pública de un comercio: /comercio/[slug]
 * SSR para SEO. El perfil rico (descripción, fotos, descuento, contacto, escuela
 * que apoya) se renderiza en servidor leyendo Firestore por slug.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comercio = await getComercioPorSlug(slug);
  if (!comercio) return { title: "Comercio no encontrado" };
  return {
    title: comercio.nombre,
    description: comercio.descripcion,
  };
}

export default async function ComercioPage({ params }: Props) {
  const { slug } = await params;
  const comercio = await getComercioPorSlug(slug);
  if (!comercio) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{comercio.nombre}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Apoya a {comercio.escuelaNombre}
      </p>
      <p className="mt-4 text-gray-700">{comercio.descripcion}</p>
      {comercio.descuento?.activo && (
        <p className="mt-4 rounded bg-amber-50 p-3 text-amber-800">
          {comercio.descuento.texto}
        </p>
      )}
    </main>
  );
}
