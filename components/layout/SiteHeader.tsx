import Link from "next/link";
import { LoginButton } from "@/components/auth/LoginButton";
import { HeaderCreateCta } from "@/components/layout/HeaderCreateCta";
import { AcademicCapIcon } from "@/components/ui/icons";

/**
 * Top brand bar (encuentra24 style): solid brand-colored band with the wordmark
 * on the left and account actions on the right. Server component; the only
 * interactive piece (LoginButton) is a client island.
 */
export function SiteHeader() {
  return (
    <header className="bg-brand-dark text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/" className="flex items-baseline gap-1 text-2xl font-bold tracking-tight">
            escuela<span className="rounded-md bg-white px-1.5 text-brand-dark">place</span>
          </Link>
          {/* Directory entry, sits with the brand. Ghost chip (vs the solid white Crear
              CTA) so it reads as secondary nav, not the primary action. Always shown —
              buyers and owners alike browse schools — icon-only below sm to save room. */}
          <Link
            href="/schools"
            aria-label="Escuelas"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/15 hover:ring-white/50"
          >
            <AcademicCapIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Escuelas</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Acquisition CTA — state-aware (see HeaderCreateCta): a learn-what-this-is
              entry for visitors, hidden for accounts that already own a page. */}
          <HeaderCreateCta />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
