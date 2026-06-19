import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGallery } from "@/components/business/PhotoGallery";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { getBusinessBySlug, splitBusinessPhotos } from "@/lib/firestore";

/**
 * Business profile "Fotos" section at /business/[slug]/photos — the merchant's storefront
 * (products and offers).
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  return {
    title: business ? `Fotos · ${business.name}` : "Comercio no encontrado",
  };
}

export default async function BusinessPhotosPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const { gallery } = splitBusinessPhotos(business);

  return (
    <Section id="fotos" ariaLabel="Fotos del comercio" title="Fotos">
      {gallery.length === 0 ? (
        <EmptyState
          title="Todavía no hay fotos"
          description="Este comercio aún no publicó fotos."
        />
      ) : (
        // Client island: the grid crops to squares, so the lightbox is the only way to see
        // the full photo.
        <PhotoGallery photos={gallery} businessName={business.name} />
      )}
    </Section>
  );
}
