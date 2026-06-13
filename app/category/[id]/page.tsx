import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { SiteHeader } from "@/components/layout/SiteHeader";
import {
  getCategoryById,
  getBusinessesByCategory,
  toBusinessCardData,
} from "@/lib/firestore";

/**
 * Public listing by category: /category/[id]
 * SSR for SEO, same feed pattern as home and /search: baseline order (stored
 * ranking.score) server-side, re-ranked client-side per the buyer's community.
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

  const cards = (await getBusinessesByCategory(id)).map(toBusinessCardData);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-slate-900">
          <span aria-hidden>{category.icon}</span> {category.name}
        </h1>

        <CommunityPicker />

        {cards.length === 0 ? (
          <p className="text-muted">
            Todavía no hay comercios en esta categoría.
          </p>
        ) : (
          <RankedFeed initial={cards} />
        )}
      </main>
    </>
  );
}
