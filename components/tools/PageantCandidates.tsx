import Image from "next/image";
import { UserIcon } from "@/components/ui/icons";
import type { CandidateDoc } from "@/types";

/**
 * Public, server-rendered roster of a reinado's candidates: a card per candidate with photo, name
 * and bio. Universal (no hooks/directives) so it renders straight from the SSR detail page.
 *
 * The vote tallies (simpatía / apoyo) are deliberately NOT shown here yet — they're
 * Cloud-Function-maintained and arrive with the economic + free-vote layers; until then a candidate
 * is presented by photo + bio only. PURELY INFORMATIONAL — the platform never processes money.
 */
export function PageantCandidates({ candidates }: { candidates: CandidateDoc[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {candidates.map((c) => (
        <li
          key={c.id}
          className="flex gap-4 rounded-2xl bg-surface p-4 ring-1 ring-black/5"
        >
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
        </li>
      ))}
    </ul>
  );
}
