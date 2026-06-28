"use client";

/**
 * Small caption under the donate CTA on the public school profile. Client island because
 * the SSR layout doesn't know who is looking: the "sign in with Google" nudge is only
 * relevant to logged-out visitors, so once the user is authenticated we drop that clause
 * and keep just the reassurance that 100% of the aporte reaches the school and the
 * platform never touches the money.
 *
 * For unverified schools the message is fixed (donating can't complete yet) and the same
 * for everyone, so auth state is ignored in that case.
 */
import { useAuth } from "@/components/auth/AuthProvider";

export function DonateHint({ unverified }: { unverified: boolean }) {
  const { user } = useAuth();

  const text = unverified
    ? "Podrás donar cuando el equipo de escuelaplace verifique esta escuela y publique sus medios de pago."
    : user
      ? "El 100% de tu aporte va directo a la escuela. La plataforma nunca toca el dinero."
      : "Inicia sesión con Google para realizar una donación. El 100% de tu aporte va directo a la escuela. La plataforma nunca toca el dinero.";

  return (
    <p className="mt-2 text-center text-xs text-muted sm:text-left">{text}</p>
  );
}
