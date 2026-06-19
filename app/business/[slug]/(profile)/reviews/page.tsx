import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ReviewList } from "@/components/reviews/ReviewList";
import { Section } from "@/components/ui/Section";
import { getBusinessBySlug, getReviewsByBusiness } from "@/lib/firestore";

/**
 * Business profile "Reseñas" section at /business/[slug]/reviews. The list (social proof)
 * leads; writing — and the Google sign-in it asks for — is the secondary action below it.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  return {
    title: business ? `Reseñas · ${business.name}` : "Comercio no encontrado",
  };
}

export default async function BusinessReviewsPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const reviews = await getReviewsByBusiness(business.id).catch(() => []);
  const stats = business.reviewStats ?? { count: 0, average: 0 };

  return (
    <Section id="resenas" ariaLabel="Reseñas">
      <ReviewList reviews={reviews} stats={stats} />

      {/* The form goes AFTER the list: buyers come to read (social proof); writing — and the
          sign-in it asks for — is the secondary action. */}
      <div className="mt-6">
        <ReviewForm
          businessId={business.id}
          businessName={business.name}
          ownerId={business.ownerId}
          editorIds={business.editorIds}
        />
      </div>
    </Section>
  );
}
