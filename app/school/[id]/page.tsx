import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessCard } from "@/components/business/BusinessCard";
import { DonorTierBadge } from "@/components/donors/DonorTierBadge";
import { SiteHeader } from "@/components/layout/SiteHeader";
import {
  getSchoolById,
  getBusinessesBySchool,
  getSchoolDonorWall,
  toBusinessCardData,
  type SchoolDonorWall,
} from "@/lib/firestore";
import type { SchoolDoc } from "@/types";

/**
 * Public school page: /school/[id]
 * SSR for SEO. Shows the school, the businesses of its community (ordered by
 * ranking.score) and the thank-you wall of personal donors. Public support metrics are
 * COUNTS only (uniqueSupporters), never amounts. Sensitive data (SINPE) lives in a
 * private subcollection and is NOT read here. No RankedFeed: every business here is tied
 * to this same school, so per-community re-ranking adds nothing.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) return { title: "Escuela no encontrada" };
  return {
    title: school.name,
    description: school.description,
  };
}

export default async function SchoolPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const [businesses, wall] = await Promise.all([
    getBusinessesBySchool(id),
    getSchoolDonorWall(id),
  ]);
  const cards = businesses.map(toBusinessCardData);
  const { province, canton } = school.location;
  const uniqueSupporters = school.metrics?.uniqueSupporters ?? 0;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {school.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {canton}, {province}
        </p>
        {uniqueSupporters > 0 && (
          <p className="mt-2 text-sm font-medium text-green-800">
            {uniqueSupporters === 1
              ? "1 donante apoya esta escuela actualmente"
              : `${uniqueSupporters} donantes apoyan esta escuela actualmente`}
          </p>
        )}
        <p className="mt-4 max-w-3xl text-slate-700">{school.description}</p>

        <h2 className="mt-10 mb-6 text-xl font-semibold text-slate-900">
          Comercios de su comunidad ({cards.length})
        </h2>

        {cards.length === 0 ? (
          <p className="text-muted">
            Todavía no hay comercios vinculados a esta escuela.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        )}

        <DonorWall school={school} wall={wall} />
      </main>
    </>
  );
}

/**
 * Thank-you wall: personal donors whose donations the school confirmed. Only opted-in
 * donors are named (name + tier + seniority — never amounts); the rest are acknowledged
 * as an anonymous count. Seniority order, not a leaderboard.
 */
function DonorWall({
  school,
  wall,
}: {
  school: SchoolDoc;
  wall: SchoolDonorWall;
}) {
  if (wall.recognized.length === 0 && wall.anonymousCount === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold text-slate-900">
        Muro de agradecimiento
      </h2>
      {school.thankYouMessage && (
        <p className="mt-2 max-w-3xl text-slate-700">{school.thankYouMessage}</p>
      )}

      {wall.recognized.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {wall.recognized.map((donor) => (
            <li
              key={donor.id}
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-900">
                {donor.displayName}
              </span>
              {donor.tier && <DonorTierBadge tier={donor.tier} />}
              {donor.firstConfirmedAt && (
                <span className="text-xs text-muted">
                  Desde {donor.firstConfirmedAt.toDate().getFullYear()}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {wall.anonymousCount > 0 && (
        <p className="mt-3 text-sm text-muted">
          {wall.anonymousCount === 1
            ? "…y 1 persona más que dona de forma anónima. ¡Gracias!"
            : `…y ${wall.anonymousCount} personas más que donan de forma anónima. ¡Gracias!`}
        </p>
      )}
    </section>
  );
}
