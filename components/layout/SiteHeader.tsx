import Link from "next/link";
import { LoginButton } from "@/components/auth/LoginButton";

/**
 * Top brand bar (encuentra24 style): solid brand-colored band with the wordmark
 * on the left and account actions on the right. Server component; the only
 * interactive piece (LoginButton) is a client island.
 */
export function SiteHeader() {
  return (
    <header className="bg-brand text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-baseline gap-1 text-2xl font-bold tracking-tight">
          escuela<span className="rounded-md bg-white px-1.5 text-brand">place</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/panel"
            className="hidden text-sm font-medium text-white/90 hover:text-white sm:block"
          >
            Crear página
          </Link>
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
