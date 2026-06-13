import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { RankedFeed } from "@/components/feed/RankedFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { TagIcon } from "@/components/ui/icons";
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
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-foreground">
          <span aria-hidden>{category.icon}</span> {category.name}
        </h1>

        <CommunityPicker />

        {cards.length === 0 ? (
          <EmptyState
            icon={<TagIcon className="h-7 w-7" />}
            title="Todavía no hay comercios en esta categoría"
            description="Probá con otra categoría o volvé más tarde: el directorio crece con la comunidad."
            cta={{ label: "Ver todas las categorías", href: "/categories" }}
          />
        ) : (
          <RankedFeed initial={cards} />
        )}
      </main>
    </>
  );
}
