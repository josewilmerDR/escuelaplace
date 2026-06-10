"use client";

/**
 * Google sign-in / sign-out for the brand header (white-on-brand chip styling, matching
 * the "Crear página" CTA). Reflects the current auth state from useAuth().
 *
 * The three states (loading / signed out / signed in) render at comparable widths so the
 * header doesn't shift on every page load while auth resolves.
 */
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function LoginButton() {
  const { user, loading, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    // Skeleton sized like the signed-out button: no layout shift when it resolves.
    return (
      <span
        aria-hidden
        className="inline-block h-10 w-36 animate-pulse rounded-md bg-white/20"
      />
    );
  }

  if (user) {
    // First name keeps the header compact; the full name is in the title tooltip. The
    // name links to the panel (the signed-in user's "my pages" home). Both pills use
    // bg-brand-darkest: white small text on the brand-dark band itself fails WCAG AA.
    const firstName = user.name.split(" ")[0] || user.email;
    return (
      <span className="flex items-center gap-2">
        <Link
          href="/panel"
          title={user.name}
          className="btn hidden max-w-36 truncate bg-brand-darkest text-white hover:bg-brand-darker sm:inline-flex"
        >
          {firstName}
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(signOut)}
          className="btn bg-brand-darkest text-white hover:bg-brand-darker"
        >
          Cerrar sesión
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(signIn)}
      className="btn btn-on-brand font-semibold"
    >
      Ingresar con Google
    </button>
  );
}
