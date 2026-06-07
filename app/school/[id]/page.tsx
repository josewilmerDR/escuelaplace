import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSchoolById, getBusinessesBySchool } from "@/lib/firestore";

/**
 * Public school page: /school/[id]
 * SSR for SEO. Shows the school and the businesses that support it, ordered by
 * ranking.score. The school has NO self-managed account (admin manages it).
 * Sensitive data (SINPE) lives in a private subcollection and is NOT read here.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) return { title: "Escuela no encontrada" };
  return {
    title: school.name,
    description: school.description,
  };
}

export default async function SchoolPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const businesses = await getBusinessesBySchool(id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{school.name}</h1>
      <p className="mt-4 text-gray-700">{school.description}</p>

      <h2 className="mt-10 text-xl font-semibold">
        Comercios que la apoyan ({businesses.length})
      </h2>
      <ul className="mt-4 space-y-2">
        {businesses.map((b) => (
          <li key={b.id}>
            <a className="underline" href={`/business/${b.slug}`}>
              {b.name}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
