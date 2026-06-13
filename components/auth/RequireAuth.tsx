"use client";

/**
 * Client-side gate for private routes (the panel). Shows a loading state while auth
 * resolves, a sign-in prompt when signed out, and the children once authenticated.
 *
 * This is a UX gate, not the security boundary — that lives in firestore.rules. It does
 * not check the global `admin` role; per-page access is enforced by ownerId/editorIds.
 */
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { LoginButton } from "./LoginButton";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    // Calm, centered loading line — settles into the same vertical rhythm as the
    // sign-in prompt below so the gate doesn't jump when auth resolves.
    return (
      <p className="py-16 text-center text-sm text-muted" role="status">
        Cargando…
      </p>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Ingresá para administrar tus páginas
        </h1>
        <p className="mt-2 text-sm text-muted">
          Creá o gestioná tu comercio o escuela. Navegar el catálogo no requiere cuenta.
        </p>
        <div className="mt-6 flex justify-center">
          <LoginButton variant="primary" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
