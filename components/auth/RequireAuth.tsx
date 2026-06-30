"use client";

/**
 * Client-side gate for private routes (the panel). Shows a loading state while auth
 * resolves, a sign-in prompt when signed out, and the children once authenticated.
 *
 * This is a UX gate, not the security boundary — that lives in firestore.rules. It does
 * not check the global `admin` role; per-page access is enforced by ownerId/editorIds.
 */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { LoginButton } from "./LoginButton";
import { SignInConsent } from "./SignInConsent";

// The sign-in wall is shared by the whole panel, but a buyer who lands here from a public
// "Donar"/"Financiar" CTA is NOT trying to manage pages — telling them to "administrar tus
// páginas" reads as a dead end. Give the contribution flows donor-oriented copy that names
// why an account is needed (the school confirms the aport) and reassures on money handling.
const CONTRIBUTION_COPY = {
  title: "Inicia sesión para registrar tu aporte",
  description:
    "Necesitas una cuenta (con Google) para que la escuela pueda confirmar tu aporte. La plataforma nunca toca el dinero: pagas directo a la escuela por los medios que ella publica.",
};

const SIGN_IN_COPY: Record<string, { title: string; description: string }> = {
  "/panel/donate": CONTRIBUTION_COPY,
  "/panel/fund": CONTRIBUTION_COPY,
};

const DEFAULT_COPY = {
  title: "Ingresa para administrar tus páginas",
  description:
    "Crea o gestiona tu comercio o escuela. Navegar el catálogo no requiere cuenta.",
};

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    // Calm, LEFT-aligned loading line — sits near the top in the same horizontal rhythm
    // as the panel page's own skeleton, so when auth resolves the loader doesn't jump
    // from center to left as the page's left-aligned content paints in.
    return (
      <p className="py-8 text-sm text-muted" role="status">
        Cargando…
      </p>
    );
  }

  if (!user) {
    const copy = SIGN_IN_COPY[pathname] ?? DEFAULT_COPY;
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm text-muted">{copy.description}</p>
        <div className="mt-6 flex justify-center">
          <LoginButton variant="primary" />
        </div>
        <SignInConsent className="mt-4 text-center" />
      </div>
    );
  }

  return <>{children}</>;
}
