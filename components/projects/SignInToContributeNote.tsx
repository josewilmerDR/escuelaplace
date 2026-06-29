"use client";

/**
 * The "inicia sesión con Google para registrar tu aporte" hint under the project's "Financiar"
 * CTA. Client island — the SSR page doesn't know who is looking: it shows only to signed-out
 * visitors (a registered user already can register a contribution, so the prompt would be noise)
 * and renders nothing while auth is still resolving, so it never flashes for a logged-in user.
 */
import { useAuth } from "@/components/auth/AuthProvider";

export function SignInToContributeNote() {
  const { user, loading } = useAuth();
  if (loading || user) return null;

  return (
    <p className="mt-2 text-xs text-muted">
      Para registrar tu aporte, inicia sesión con Google.
    </p>
  );
}
