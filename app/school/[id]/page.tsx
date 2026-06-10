import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/business/BusinessCard";
import { SiteHeader } from "@/components/layout/SiteHeader";
import {
  getSchoolById,
  getBusinessesBySchool,
  toBusinessCardData,
} from "@/lib/firestore";

/**
 * Public school page: /school/[id]
 * SSR for SEO. Shows the school and the businesses of its community, ordered by
 * ranking.score. Sensitive data (SINPE) lives in a private subcollection and is NOT
 * read here. No RankedFeed: every business here is tied to this same school, so
 * per-community re-ranking adds nothing.
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

  const cards = (await getBusinessesBySchool(id)).map(toBusinessCardData);
  const { province, canton } = school.location;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {school.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {canton}, {province}
        </p>
        <p className="mt-4 max-w-3xl text-slate-700">{school.description}</p>

        <h2 className="mt-10 mb-6 text-xl font-semibold text-slate-900">
          Comercios de su comunidad ({cards.length})
        </h2>

        {cards.length === 0 ? (
          <p className="text-muted">
            Todavía no hay comercios vinculados a esta escuela.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
