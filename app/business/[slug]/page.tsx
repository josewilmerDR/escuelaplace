import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/firestore";

/**
 * Public business page: /business/[slug]
 * SSR for SEO. The rich profile (description, photos, discount, contact, supported
 * school) is rendered on the server reading Firestore by slug.
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
    </main>
  );
}
