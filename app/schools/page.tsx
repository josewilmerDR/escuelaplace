import type { Metadata } from "next";
import Link from "next/link";
import { CommunityPicker } from "@/components/buyer/CommunityPicker";
import { SchoolDirectoryFeed } from "@/components/school/SchoolDirectoryFeed";
import {
  getSchools,
  rankSchoolsByRelevance,
  toSchoolCardData,
} from "@/lib/firestore";
import type { SchoolCardData } from "@/types";

/**
 * Public school directory (/schools). Server component — rendered on the server for SEO, like
 * the home catalog. The baseline order is by activity (community-agnostic) so SEO is stable;
 * <SchoolDirectoryFeed> re-orders by proximity client-side from the buyer's community.
 *
 * ISR: re-render the baseline every 5 minutes (matches the home page) so the order stays fresh
 * as activity metrics change, without a Firestore read per request.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Escuelas",
  description:
    "Directorio de escuelas en escuelaplace. Encontrá la escuela de tu comunidad, conocé sus proyectos y apoyala directamente.",
};

export default async function SchoolsPage() {
  // Empty vs error are distinct states (same as the home page): "no schools yet" gets an
  // onboarding CTA; "directory unavailable" gets a retry message.
  let cards: SchoolCardData[] = [];
  let loadFailed = false;
  try {
    const schools = await getSchools();
    // No location server-side → activity baseline order (deterministic for SEO/first paint).
    cards = rankSchoolsByRelevance(schools.map(toSchoolCardData), {}).map(
      (r) => r.school,
    );
  } catch {
    loadFailed = true;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Escuelas</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Encontrá la escuela de tu comunidad, conocé sus proyectos y apoyala
        directamente. La plataforma nunca toca el dinero.
      </p>

      <div className="mt-6">
        <CommunityPicker description="Elegí tu escuela o activá tu ubicación para ver primero las escuelas más cercanas a tu comunidad." />

        {loadFailed ? (
          <p className="text-muted">
            No pudimos cargar las escuelas. Recargá la página para intentarlo de
            nuevo.
          </p>
        ) : cards.length === 0 ? (
          <p className="text-muted">
            Todavía no hay escuelas publicadas.{" "}
            <Link
              href="/create"
              className="font-medium text-brand-darker hover:underline"
            >
              Creá la de tu comunidad
            </Link>
            .
          </p>
        ) : (
          <SchoolDirectoryFeed initial={cards} />
        )}
      </div>
    </main>
  );
}
