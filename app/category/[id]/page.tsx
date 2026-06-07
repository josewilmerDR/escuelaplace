import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryById, getBusinessesByCategory } from "@/lib/firestore";

/**
 * Public listing by category: /category/[id]
 * SSR for SEO. Businesses of the category ordered by ranking.score.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const category = await getCategoryById(id);
  if (!category) return { title: "Categoría no encontrada" };
  return { title: category.name };
}

export default async function CategoryPage({ params }: Props) {
  const { id } = await params;
  const category = await getCategoryById(id);
  if (!category) notFound();

  const businesses = await getBusinessesByCategory(id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{category.name}</h1>
      <ul className="mt-6 space-y-2">
        {businesses.map((b) => (
          <li key={b.id}>
            <a className="underline" href={`/business/${b.slug}`}>
              {b.name}
            </a>{" "}
            <span className="text-sm text-gray-500">— {b.schoolName}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
