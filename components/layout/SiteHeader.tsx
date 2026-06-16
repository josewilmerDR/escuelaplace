import Link from "next/link";
import { LoginButton } from "@/components/auth/LoginButton";
import { HeaderBrowse } from "@/components/layout/HeaderBrowse";
import { HeaderCreateCta } from "@/components/layout/HeaderCreateCta";
import { HeaderDonateCta } from "@/components/layout/HeaderDonateCta";

/**
 * Top brand bar (encuentra24 style): solid brand-colored band with the wordmark
 * on the left and account actions on the right. Server component; the only
 * interactive piece (LoginButton) is a client island.
 */
export function SiteHeader() {
  return (
    // Sticky brand band so content scrolls cleanly under it; a soft bottom hairline +
    // small shadow sets it apart from the page without a hard 1px line (depth, not borders).
    <header className="sticky top-0 z-40 bg-brand-dark text-white shadow-sm ring-1 ring-black/5">
      {/* Flat flex row (no justify-between): the wordmark stays left and pinned (shrink-0),
          and HeaderBrowse contributes a flex-1 element — the embedded search on inner pages,
          an empty spacer on home — that fills the gap and pushes the actions right. */}
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link
          href="/"
          className="flex shrink-0 items-baseline gap-1 text-2xl font-bold tracking-tight"
        >
          escuela<span className="rounded-md bg-white px-1.5 text-brand-dark">place</span>
        </Link>

        {/* Browse cluster (search + Categorías + Escuelas). A route-aware client island:
            on inner pages the search bar grows to fill the space between the wordmark and the
            chips; on home the hero already owns search + category chips, so it collapses to a
            spacer + Escuelas. */}
        <HeaderBrowse />
        {/* Mission CTA — a secondary ghost chip (preselects the buyer's community school)
            that keeps "Dona a una escuela" reachable everywhere without rivaling the solid
            Crear CTA. Grouped with the browse chips, ahead of the single solid CTA + login. */}
        <HeaderDonateCta />
        {/* Acquisition CTA — state-aware (see HeaderCreateCta): a learn-what-this-is
            entry for visitors, hidden for accounts that already own a page. */}
        <HeaderCreateCta />
        <LoginButton />
      </div>
    </header>
  );
}
