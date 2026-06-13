import Link from "next/link";
import { LoginButton } from "@/components/auth/LoginButton";
import { HeaderCreateCta } from "@/components/layout/HeaderCreateCta";

/**
 * Top brand bar (encuentra24 style): solid brand-colored band with the wordmark
 * on the left and account actions on the right. Server component; the only
 * interactive piece (LoginButton) is a client island.
 */
export function SiteHeader() {
  return (
    <header className="bg-brand-dark text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-5 sm:gap-7">
          <Link href="/" className="flex items-baseline gap-1 text-2xl font-bold tracking-tight">
            escuela<span className="rounded-md bg-white px-1.5 text-brand-dark">place</span>
          </Link>
          <nav>
            <Link
              href="/schools"
              className="text-sm font-medium text-white/90 transition-colors hover:text-white"
            >
              Escuelas
            </Link>
          </nav>
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
