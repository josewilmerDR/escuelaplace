import Image from "next/image";
import Link from "next/link";
import { UserIcon } from "@/components/ui/icons";
import type { CandidateDoc } from "@/types";
import { PageantApplauseButton } from "./PageantApplauseButton";

/**
 * Public, server-rendered roster of a reinado's candidates: a card per candidate with photo, name,
 * bio, the count-only tallies — free "simpatía" applause (`voteFree`), CONFIRMED economic support
 * (`voteSupport`) and recurring sponsors (`padrinoCount`), never a money figure — plus the matching
 * actions ("Aplaudir", "Apoyar", "Apadrinar"). The card itself is universal (no hooks/directives) so
 * it renders straight from the SSR detail page; the applause button is the lone client island inside.
 *
 * Every tally is Cloud-Function-maintained, so none can be inflated client-side. The "simpatía" bar +
 * applause appear only when the school turned free voting on (`freeVotingEnabled`). PURELY
 * INFORMATIONAL — the platform never processes money; "Apoyar" (one-time) and "Apadrinar" (recurring)
 * route to the panel flows where the supporter pays the school directly, and "Aplaudir" is a capped,
 * non-binding community signal.
 */
export function PageantCandidates({
  candidates,
  schoolId,
  toolId,
  canSupport,
  freeVotingEnabled,
}: {
  candidates: CandidateDoc[];
  schoolId: string;
  toolId: string;
  /** Whether the school is verified — gates the "Apoyar" CTA (support can't be recorded otherwise). */
  canSupport: boolean;
  /** Whether the school enabled the free "simpatía" layer — gates the applause bar + button. */
  freeVotingEnabled: boolean;
}) {
  // Bar scale: each candidate's tally relative to the roster leader of that axis. Counts only —
  // never a money figure. Guard /0 when no one has any yet.
  const maxSupport = Math.max(1, ...candidates.map((c) => c.voteSupport ?? 0));
  const maxFree = Math.max(1, ...candidates.map((c) => c.voteFree ?? 0));

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {candidates.map((c) => {
        const support = c.voteSupport ?? 0;
        const pct = Math.round((support / maxSupport) * 100);
        const free = c.voteFree ?? 0;
        const freePct = Math.round((free / maxFree) * 100);
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

            {/* Free "simpatía" applause — a count-only bar, lighter than the support bar. */}
            {freeVotingEnabled && (
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-foreground">Simpatía</span>
                  <span className="tabular-nums text-muted">
                    {free} {free === 1 ? "aplauso" : "aplausos"}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full bg-brand-tint"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-brand/50"
                    style={{ width: `${freePct}%` }}
                  />
                </div>
              </div>
            )}

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
              {c.padrinoCount > 0 && (
                <p className="mt-1 text-xs text-muted">
                  {c.padrinoCount}{" "}
                  {c.padrinoCount === 1 ? "padrino recurrente" : "padrinos recurrentes"}
                </p>
              )}
            </div>

            {/* Actions: the free applause (when enabled) and the economic CTAs. */}
            {freeVotingEnabled && (
              <PageantApplauseButton
                schoolId={schoolId}
                toolId={toolId}
                candidateId={c.id}
                candidateName={c.name}
              />
            )}

            {canSupport && (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/panel/pageant-support?schoolId=${schoolId}&toolId=${toolId}&candidateId=${c.id}`}
                  className="btn btn-primary self-start"
                >
                  Apoyar
                </Link>
                <Link
                  href={`/panel/donate?schoolId=${schoolId}&pageantToolId=${toolId}&candidateId=${c.id}&candidateName=${encodeURIComponent(c.name)}`}
                  className="btn btn-outline self-start"
                >
                  Apadrinar
                </Link>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
