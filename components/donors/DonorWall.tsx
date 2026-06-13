import { DonorTierBadge } from "@/components/donors/DonorTierBadge";
import type { SchoolDonorWall } from "@/lib/firestore";
import type { SchoolDoc } from "@/types";

/**
 * Thank-you wall: personal donors whose donations the school confirmed. Only opted-in
 * donors are named (name + tier + seniority — never amounts); the rest are acknowledged
 * as an anonymous count. Seniority order, not a leaderboard. Rendered SSR from the public
 * school page; the caller decides whether there is anything to show (hasWall).
 */
export function DonorWall({
  school,
  wall,
}: {
  school: SchoolDoc;
  wall: SchoolDonorWall;
}) {
  return (
    <section
      id="muro"
      className="mt-4 scroll-mt-6 rounded-2xl border border-border bg-white p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold">Muro de agradecimiento</h2>
      {school.thankYouMessage && (
        <p className="mt-2 text-slate-700">{school.thankYouMessage}</p>
      )}

      {wall.recognized.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {wall.recognized.map((donor) => (
            <li
              key={donor.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-900">
                {donor.displayName}
              </span>
              {donor.tier && <DonorTierBadge tier={donor.tier} />}
              {(donor.projectsSupported ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-darker">
                  {donor.projectsSupported === 1
                    ? "Participó en 1 proyecto"
                    : `Participó en ${donor.projectsSupported} proyectos`}
                </span>
              )}
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
