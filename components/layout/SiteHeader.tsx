import Link from "next/link";
import { LoginButton } from "@/components/auth/LoginButton";

/**
 * Top brand bar (encuentra24 style): solid brand-colored band with the wordmark
 * on the left and account actions on the right. Server component; the only
 * interactive piece (LoginButton) is a client island.
 */
export function SiteHeader() {
  return (
    <header className="bg-brand-dark text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-baseline gap-1 text-2xl font-bold tracking-tight">
          escuela<span className="rounded-md bg-white px-1.5 text-brand-dark">place</span>
        </Link>

        <div className="flex items-center gap-3">
          {/* The page-owner CTA must exist on mobile too (owners sign up from their
              phone): icon-only chip under sm, full label from sm up. */}
          <Link
            href="/panel"
            aria-label="Crear página"
            className="btn btn-on-brand gap-1 font-semibold"
          >
            <span aria-hidden className="text-base leading-none">
              +
            </span>
            <span className="hidden sm:inline">Crear página</span>
          </Link>
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
