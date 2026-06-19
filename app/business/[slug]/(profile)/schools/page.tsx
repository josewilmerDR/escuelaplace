import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { AcademicCapIcon } from "@/components/ui/icons";
import {
  getBusinessBySlug,
  getSubscriptionsByBusiness,
  supportedSchoolsOf,
} from "@/lib/firestore";

/**
 * Business profile "Escuelas que apoya" section at /business/[slug]/schools — the full,
 * objective roster (the SupportBadge's "y N más" links here). Names only, never money
 * figures: support is a relationship, not a published payment (see CLAUDE.md).
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  return {
    title: business ? `Escuelas · ${business.name}` : "Comercio no encontrado",
  };
}

export default async function BusinessSchoolsPage({ params }: Props) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const supportedSchools = supportedSchoolsOf(
    await getSubscriptionsByBusiness(business.id).catch(() => []),
    [],
  );

  return (
    <Section
      id="escuelas"
      title="Escuelas que apoya"
      description={
        supportedSchools.length === 1
          ? "Este comercio apoya a una institución de la comunidad."
          : supportedSchools.length > 1
            ? `Este comercio apoya a ${supportedSchools.length} instituciones de la comunidad.`
            : undefined
      }
    >
      {supportedSchools.length === 0 ? (
        <EmptyState
          icon={<AcademicCapIcon className="h-7 w-7" />}
          title="Todavía no apoya a ninguna escuela"
          description="Este comercio aún no registra apoyo confirmado a una escuela de la comunidad."
        />
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {supportedSchools.map((school) => (
            <li key={school.id}>
              <Chip href={`/school/${school.id}`}>{school.name}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
