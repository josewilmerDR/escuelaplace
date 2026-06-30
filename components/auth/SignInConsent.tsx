import Link from "next/link";

/**
 * Consent-at-action notice shown beneath a Google sign-in button. Signing in
 * creates the user's account (users/{uid}) and processes the name/email from the
 * Google profile, so the surfaces that prompt a deliberate sign-in — the panel
 * wall (<RequireAuth>) and the review form — carry this notice. Clear notice at
 * the action is the standard pattern for Google-only OAuth.
 *
 * The header's compact "Ingresar" chip is a returning-user shortcut and does NOT
 * show it; the binding moment (creating a page, registering an aporte, posting a
 * review) always passes through one of the surfaces above.
 *
 * Links open the legal pages in a new tab so the user keeps the sign-in context.
 * Presentational, server-safe (no hooks).
 */
export function SignInConsent({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`.trim()}>
      Al continuar, aceptas los{" "}
      <Link
        href="/terms"
        target="_blank"
        className="font-medium text-brand-darker underline hover:text-brand-darkest"
      >
        Términos y Condiciones
      </Link>{" "}
      y la{" "}
      <Link
        href="/privacy"
        target="_blank"
        className="font-medium text-brand-darker underline hover:text-brand-darkest"
      >
        Política de Privacidad
      </Link>
      .
    </p>
  );
}
