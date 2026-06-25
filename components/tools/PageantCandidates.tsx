import Image from "next/image";
import Link from "next/link";
import { UserIcon } from "@/components/ui/icons";
import type { CandidateDoc } from "@/types";

/**
 * Public, server-rendered roster of a reinado's candidates: a card per candidate with photo, name,
 * bio, the CONFIRMED economic-support tally (a count-only bar — never a money figure) and an
 * "Apoyar" CTA. Universal (no hooks/directives) so it renders straight from the SSR detail page.
 *
 * The support tally (`voteSupport`/`supportCount`) is Cloud-Function-maintained; the free "simpatía"
 * applause bar arrives with the free-vote layer. PURELY INFORMATIONAL — the platform never processes
 * money; the "Apoyar" CTA routes to the panel flow where the supporter pays the school directly.
 */
export function PageantCandidates({
  candidates,
  schoolId,
  toolId,
  canSupport,
}: {
  candidates: CandidateDoc[];
  schoolId: string;
  toolId: string;
  /** Whether the school is verified — gates the "Apoyar" CTA (support can't be recorded otherwise). */
  canSupport: boolean;
}) {
  // Bar scale: each candidate's confirmed support relative to the roster leader. Counts only —
  // never a money figure. Guard /0 when no one has support yet.
  const maxSupport = Math.max(1, ...candidates.map((c) => c.voteSupport ?? 0));

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {candidates.map((c) => {
        const support = c.voteSupport ?? 0;
        const pct = Math.round((support / maxSupport) * 100);
        return (
          <li
            key={c.id}
            className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-black/5"
          >
            <div className="flex gap-4">
              <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-full bg-brand-tint ring-1 ring-black/5">
                {c.photoUrl ? (
                  <Image src={c.photoUrl} alt="" fill sizes="80px" className="object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-brand-darker">
                    <UserIcon className="h-8 w-8" />
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold tracking-tight text-foreground">{c.name}</h3>
                {c.bio && (
                  <p className="mt-1 whitespace-pre-line text-sm text-muted">{c.bio}</p>
                )}
              </div>
            </div>

            {/* Confirmed economic support — a count-only bar (no money figures). */}
            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-foreground">Apoyo confirmado</span>
                <span className="tabular-nums text-muted">
                  {support}
                  {c.supportCount > 0
                    ? ` · ${c.supportCount} ${c.supportCount === 1 ? "partidario" : "partidarios"}`
                    : ""}
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-brand-tint"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {canSupport && (
              <Link
                href={`/panel/pageant-support?schoolId=${schoolId}&toolId=${toolId}&candidateId=${c.id}`}
                className="btn btn-primary self-start"
              >
                Apoyar
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
