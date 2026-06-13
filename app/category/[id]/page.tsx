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
        <header className="mb-8 flex items-center gap-4">
          {/* App-icon tile carrying the category glyph, mirroring the categories index. */}
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-2xl ring-1 ring-inset ring-brand-dark/10"
          >
            {category.icon}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {category.name}
          </h1>
        </header>

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
