"use client";

/**
 * Google sign-in, plus the signed-in account avatar (the Google photo, or a person icon as
 * fallback → panel). Reflects the auth state from useAuth(). Signing OUT is no longer here —
 * it lives in the panel sidebar (see SignOutButton); the avatar is the way there.
 *
 * Two surface variants apply to the signed-out button and the loading skeleton: "on-brand"
 * (default) is the white chip for the brand header, matching the "Crear página" CTA;
 * "primary" is for light surfaces (review form, RequireAuth), where the white chip has no
 * border and disappears.
 *
 * The three states (loading / signed out / signed in) resolve without shifting the header
 * much while auth settles.
 */
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { UserIcon } from "@/components/ui/icons";

export function LoginButton({
  variant = "on-brand",
}: {
  variant?: "on-brand" | "primary";
}) {
  const { user, fbUser, loading, signIn } = useAuth();
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
        className={`inline-block h-10 w-36 animate-pulse rounded-md ${
          variant === "primary" ? "bg-slate-200" : "bg-white/20"
        }`}
      />
    );
  }

  if (user) {
    // Account avatar — the familiar pattern: the Google photo, or a person silhouette when
    // there's none. Links to the panel (the signed-in user's "my pages" home, where signing
    // out now lives); the full name is the tooltip and the accessible label.
    const photo = fbUser?.photoURL;
    return (
      <Link
        href="/panel"
        title={user.name}
        aria-label={`Tu cuenta: ${user.name}`}
        className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-darkest text-white ring-1 ring-white/40 transition hover:ring-white/70"
      >
        {photo ? (
          // next/image is overkill for a 40px third-party avatar and can't set the
          // referrerPolicy Google's photo CDN expects; a plain <img> is the right tool here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={40}
            height={40}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <UserIcon className="h-6 w-6" />
        )}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(signIn)}
      className={
        variant === "primary"
          ? "btn btn-primary"
          : "btn btn-on-brand font-semibold"
      }
    >
      Ingresar con Google
    </button>
  );
}
