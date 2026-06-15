import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { AcademicCapIcon, WarningIcon } from "@/components/ui/icons";
import { SchoolDirectory } from "@/components/school/SchoolDirectory";
import {
  getSchoolIdsWithActiveProject,
  getSchools,
  rankSchoolsByRelevance,
  toSchoolCardData,
} from "@/lib/firestore";
import { absoluteUrl } from "@/lib/site";
import type { SchoolCardData } from "@/types";

/**
 * Public school directory (/schools). Server component — rendered on the server for SEO, like
 * the home catalog. The baseline order is by activity (community-agnostic) so SEO is stable;
 * <SchoolDirectory> then layers client-side filter (by name/locality) and proximity ordering
 * on top — controls that act only on this list, not on the buyer's site-wide community.
 *
 * ISR: re-render the baseline every 5 minutes (matches the home page) so the order stays fresh
 * as activity metrics change, without a Firestore read per request.
 */
export const revalidate = 300;

// Directory render cap. Keeps the SSR payload and the client-side proximity re-rank bounded;
// getSchools' own 500 cap is just a runaway backstop. Make this pagination if the directory ever
// outgrows it (same note as getSchools in lib/firestore/schools.ts).
const DIRECTORY_LIMIT = 60;

const DESCRIPTION =
  "Encontrá la escuela de tu comunidad, conocé sus proyectos y apoyala directamente. El 100% de tu donación llega a la escuela: la plataforma nunca toca el dinero.";

export const metadata: Metadata = {
  title: "Escuelas",
  description: DESCRIPTION,
  alternates: { canonical: "/schools" },
  openGraph: { title: "Escuelas", description: DESCRIPTION },
};

export default async function SchoolsPage() {
  // Empty vs error are distinct states (same as the home page): "no schools yet" gets an
  // onboarding CTA; "directory unavailable" gets a retry message.
  let cards: SchoolCardData[] = [];
  let loadFailed = false;
  try {
    const schools = await getSchools(DIRECTORY_LIMIT);
    // "Active project" is a decorative badge: a failed projects read must not blank the
    // whole directory, so fall back to no badges rather than letting it throw.
    const activeProjectSchoolIds = await getSchoolIdsWithActiveProject().catch(
      () => new Set<string>(),
    );
    // No location server-side → activity baseline order (deterministic for SEO/first paint).
    cards = rankSchoolsByRelevance(
      schools.map((s) =>
        toSchoolCardData(s, { hasActiveProject: activeProjectSchoolIds.has(s.id) }),
      ),
      {},
    ).map((r) => r.school);
  } catch {
    loadFailed = true;
  }

  // Breadcrumb + item list so search engines understand where this page sits and what it
  // lists. URLs are ABSOLUTE (absoluteUrl): Google ignores relative item/url in these
  // schemas, so a relative breadcrumb yields no rich result. "<" escaped so school names
  // can't close the script tag. Mirrors the JSON-LD on /categories so the directory and its
  // listings describe the same shape to crawlers.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: absoluteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Escuelas",
        item: absoluteUrl("/schools"),
      },
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: cards.map((card, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: card.name,
      url: absoluteUrl(`/school/${card.id}`),
    })),
  };

  return (
    <PageContainer variant="listing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c"),
        }}
      />
      {cards.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListLd).replace(/</g, "\\u003c"),
          }}
        />
      )}

      <header className="mb-8">
        <h1 className="text-sm text-muted">{DESCRIPTION}</h1>
      </header>

      {loadFailed ? (
        <EmptyState
          icon={<WarningIcon className="h-7 w-7" />}
          title="No pudimos cargar las escuelas"
          description="Recargá la página para intentarlo de nuevo."
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<AcademicCapIcon className="h-7 w-7" />}
          title="Todavía no hay escuelas publicadas"
          description="Sé la primera de tu zona en sumarse y aparecé en el directorio."
          cta={{ label: "Creá la de tu comunidad", href: "/create" }}
        />
      ) : (
        // The directory's own filter/sort toolbar lives in this client component; it acts
        // only on the list in front of the buyer (filter by name/locality, order by
        // proximity) — it does NOT set the buyer's site-wide community the way the home
        // <CommunityPicker> does.
        <SchoolDirectory initial={cards} limit={DIRECTORY_LIMIT} />
      )}
    </PageContainer>
  );
}
