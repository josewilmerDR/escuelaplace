import Link from "next/link";
import { LoginButton } from "@/components/auth/LoginButton";
import { HeaderCreateCta } from "@/components/layout/HeaderCreateCta";
import { AcademicCapIcon, TagIcon } from "@/components/ui/icons";

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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/" className="flex items-baseline gap-1 text-2xl font-bold tracking-tight">
            escuela<span className="rounded-md bg-white px-1.5 text-brand-dark">place</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Directory entries. Ghost chips (vs the solid white Crear CTA) so they read as
              secondary nav, not the primary action. Always shown — buyers and owners alike
              browse the catalog — icon-only below sm to save room. White-on-brand ghost chip:
              the band is dark enough for AA, so a soft inset ring + translucent hover keep
              it crisp without the light-card recipe. Categorías leads (the browse-by-rubro
              entry, the catalog's primary axis), then Escuelas. */}
          <Link
            href="/categories"
            aria-label="Categorías"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/15 hover:ring-white/50"
          >
            <TagIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Categorías</span>
          </Link>
          <Link
            href="/schools"
            aria-label="Escuelas"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/15 hover:ring-white/50"
          >
            <AcademicCapIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Escuelas</span>
          </Link>
          {/* Acquisition CTA — state-aware (see HeaderCreateCta): a learn-what-this-is
              entry for visitors, hidden for accounts that already own a page. */}
          <HeaderCreateCta />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
