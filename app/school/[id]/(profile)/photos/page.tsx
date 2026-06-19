import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGallery } from "@/components/business/PhotoGallery";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { getSchoolById } from "@/lib/firestore";

/** School profile "Fotos" section at /school/[id]/photos. */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  return { title: school ? `Fotos · ${school.name}` : "Escuela no encontrada" };
}

export default async function SchoolPhotosPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const gallery = school.photos ?? [];

  return (
    <Section id="fotos" ariaLabel="Fotos de la escuela" title="Fotos">
      {gallery.length === 0 ? (
        <EmptyState
          title="Todavía no hay fotos"
          description="Esta escuela aún no publicó fotos."
        />
      ) : (
        // Client island: the grid crops to squares, so the lightbox is the only way to see
        // the full photo.
        <PhotoGallery photos={gallery} businessName={school.name} />
      )}
    </Section>
  );
}
