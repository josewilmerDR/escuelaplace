import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { Stars } from "@/components/reviews/Stars";
import { getBusinessBySlug, getReviewsByBusiness } from "@/lib/firestore";

/**
 * Public business page: /business/[slug]
 * SSR for SEO. The rich profile (description, photos, discount, supported school) and the
 * reviews are rendered on the server reading Firestore by slug. Writing a review is a
 * client island (<ReviewForm>) that requires Google sign-in.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) return { title: "Comercio no encontrado" };
  return {
    title: business.name,
    description: business.description,
  };
}

export default async function BusinessPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const reviews = await getReviewsByBusiness(business.id);
  const stats = business.reviewStats ?? { count: 0, average: 0 };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{business.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Apoya a {business.schoolName}
      </p>
      <p className="mt-4 text-gray-700">{business.description}</p>
      {business.discount?.active && (
        <p className="mt-4 rounded bg-amber-50 p-3 text-amber-800">
          {business.discount.text}
        </p>
      )}

      <section className="mt-12">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Reseñas</h2>
          {stats.count > 0 && (
            <span className="flex items-center gap-1 text-sm text-muted">
              <Stars value={stats.average} />
              {stats.average.toFixed(1)} ({stats.count})
            </span>
          )}
        </div>

        <div className="mt-4">
          <ReviewForm
            businessId={business.id}
            ownerId={business.ownerId}
            editorIds={business.editorIds}
          />
        </div>

        {reviews.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            Todavía no hay reseñas. Sé la primera persona en dejar una.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-900">{r.authorName}</span>
                  <Stars value={r.rating} className="text-sm" />
                </div>
                {r.text && <p className="mt-2 text-sm text-gray-700">{r.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
