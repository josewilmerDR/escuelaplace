"use client";

/**
 * Google sign-in, plus the signed-in account control (<AccountMenu>): the Google-photo avatar,
 * which links to the panel on desktop and opens a dropdown account menu on mobile. Reflects
 * the auth state from useAuth(). Signing OUT lives inside that menu / the panel sidebar (see
 * SignOutButton); the avatar is the way there.
 *
 * Two surface variants apply to the signed-out button and the loading skeleton: "on-brand"
 * (default) is the white chip for the brand header, matching the "Crear página" CTA;
 * "primary" is for light surfaces (review form, RequireAuth), where the white chip has no
 * border and disappears.
 *
 * The three states (loading / signed out / signed in) resolve without shifting the header
 * much while auth settles.
 */
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { AccountMenu } from "./AccountMenu";
import { GoogleIcon } from "@/components/ui/icons";

export function LoginButton({
  variant = "on-brand",
}: {
  variant?: "on-brand" | "primary";
}) {
  const { user, loading, signIn } = useAuth();
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
    // Skeleton sized like the signed-out button: no layout shift when it resolves. The
    // header (on-brand) button is now a constant-width "G Ingresar" chip at every width.
    return (
      <span
        aria-hidden
        className={`inline-block h-10 animate-pulse rounded-xl ${
          variant === "primary" ? "w-36 bg-slate-200" : "w-28 bg-white/20"
        }`}
      />
    );
  }

  if (user) {
    // Signed-in: the account avatar, which links to the panel on desktop and opens the
    // account menu on mobile. See AccountMenu.
    return <AccountMenu user={user} />;
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(signIn)}
      className={
        variant === "primary"
          ? "btn btn-primary"
          : "btn btn-on-brand gap-1.5 font-semibold"
      }
    >
      {variant === "on-brand" ? (
        // Compacted header: the Google "G" logo carries the provider, so the label drops to
        // just "Ingresar" at every width (the full "con Google" string crowded the brand band).
        <>
          <GoogleIcon className="h-4 w-4" />
          Ingresar
        </>
      ) : (
        "Ingresar con Google"
      )}
    </button>
  );
}
