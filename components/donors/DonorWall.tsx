import { DonorTierBadge } from "@/components/donors/DonorTierBadge";
import { Section } from "@/components/ui/Section";
import { StatChip } from "@/components/ui/StatChip";
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
  // SSR-evaluated current year — used to suppress a redundant "Desde {year}" when the
  // donor's first confirmed donation happened this same year (reads odd otherwise).
  const currentYear = new Date().getFullYear();
  return (
    <Section id="muro" title="Muro de agradecimiento">
      {school.thankYouMessage && (
        <p className="mt-2 text-muted">{school.thankYouMessage}</p>
      )}

      {wall.recognized.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {wall.recognized.map((donor) => (
            <li
              key={donor.id}
              className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-black/5"
            >
              <span className="font-medium text-foreground">
                {donor.displayName}
              </span>
              {donor.tier && <DonorTierBadge tier={donor.tier} />}
              {(donor.projectsSupported ?? 0) > 0 && (
                <StatChip tone="brand">
                  {donor.projectsSupported === 1
                    ? "Participó en 1 proyecto"
                    : `Participó en ${donor.projectsSupported} proyectos`}
                </StatChip>
              )}
              {donor.firstConfirmedAt &&
                donor.firstConfirmedAt.toDate().getFullYear() !== currentYear && (
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
    </Section>
  );
}
