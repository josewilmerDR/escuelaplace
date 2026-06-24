import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/business/BusinessCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { TagIcon } from "@/components/ui/icons";
import {
  getSchoolById,
  getSupportingBusinesses,
  toBusinessCardData,
} from "@/lib/firestore";

/**
 * School profile "Comercios" section at /school/[id]/businesses. Lists the businesses with
 * confirmed, recent support for THIS school — resolved from the support relationship
 * (getSupportingBusinesses), not from the business's linked `schoolId`, so a supporter
 * linked to another school is not dropped. Buying from them is the support action an
 * anonymous buyer CAN take without signing in; when there are none, the empty state invites
 * a business to be the first supporter (the highest-intent moment) and still points buyers
 * to the wider catalog.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  return {
    title: school ? `Comercios · ${school.name}` : "Escuela no encontrada",
  };
}

export default async function SchoolBusinessesPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const cards = (await getSupportingBusinesses(id).catch(() => [])).map(
    toBusinessCardData,
  );

  return (
    <Section
      id="comercios"
      title="Comercios que apoyan a la escuela"
      description={
        cards.length > 0
          ? "Apoya a la escuela comprándole a los comercios que ya la apoyan."
          : undefined
      }
    >
      {cards.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="h-7 w-7" />}
          title="Todavía no hay comercios que la apoyen"
          description="¿Tienes un comercio? Sé el primero en apoyar a esta escuela y aparece aquí para que la comunidad te compre."
          cta={
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/create" className="btn btn-primary">
                Crear la página de mi comercio
              </Link>
              <Link
                href="/search"
                className="text-sm font-medium text-brand-darker hover:underline"
              >
                Explorar el directorio
              </Link>
            </div>
          }
        />
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
        </div>
      )}
    </Section>
  );
}
