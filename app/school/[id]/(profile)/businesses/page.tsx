import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/business/BusinessCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { TagIcon } from "@/components/ui/icons";
import {
  getBusinessesBySchool,
  getConfirmedSubscriptionsBySchool,
  getSchoolById,
  recentBusinessSupporterIds,
  toBusinessCardData,
} from "@/lib/firestore";

/**
 * School profile "Comercios" section at /school/[id]/businesses. Lists only businesses with
 * confirmed, recent support (same predicate as the header's recent-supporters chip) — not
 * every business that merely declares this school — so the section is honest. Buying from
 * them is the support action an anonymous buyer CAN take without signing in, so the empty
 * state points to the wider catalog instead of dead-ending.
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

  const [businesses, confirmedSubs] = await Promise.all([
    getBusinessesBySchool(id).catch(() => []),
    getConfirmedSubscriptionsBySchool(id).catch(() => []),
  ]);
  const supporterIds = recentBusinessSupporterIds(confirmedSubs);
  const cards = businesses
    .filter((b) => supporterIds.has(b.id))
    .map(toBusinessCardData);

  return (
    <Section
      id="comercios"
      title="Comercios que apoyan a la escuela"
      description={
        cards.length > 0
          ? "Apoyá a la escuela comprándole a los comercios que ya la apoyan."
          : undefined
      }
    >
      {cards.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="h-7 w-7" />}
          title="Todavía no hay comercios que la apoyen"
          description="Explorá el directorio y apoyá a tu escuela comprándole a los comercios de tu comunidad."
          cta={{ label: "Explorar comercios", href: "/search" }}
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
