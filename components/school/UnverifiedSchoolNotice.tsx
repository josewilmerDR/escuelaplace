/**
 * Inline "school not verified yet" copy for the support flows. One source per flow so the
 * matching screens read identically and the wording can't drift between them:
 *  - FUNDING — project contributions (project detail page + /panel/fund). Contributions are
 *    BLOCKED until the school is verified, so the copy is a hard stop.
 *  - DONATION / SUBSCRIPTION — personal donation (/panel/donate) and business subscription
 *    (/panel/business/[id]/subscribe). These CAN be registered against an unverified school
 *    (only the payment methods stay hidden), so the copy invites registering anyway.
 */
export const UNVERIFIED_FUNDING_TEXT =
  "Esta escuela todavía no fue verificada por el equipo de escuelaplace. Vas a poder aportar a este proyecto en cuanto la verifiquemos.";

export const UNVERIFIED_DONATION_TEXT =
  "Esta escuela aún no está verificada, así que sus métodos de pago no están disponibles. Podés registrar la donación igual; la escuela la confirmará al verificarse.";

export const UNVERIFIED_SUBSCRIPTION_TEXT =
  "Esta escuela aún no está verificada, así que sus métodos de pago no están disponibles. Podés registrar el apoyo igual; la escuela lo confirmará al verificarse.";

export function UnverifiedSchoolNotice() {
  return (
    <p className="rounded-xl bg-warning-tint p-3 text-sm text-warning ring-1 ring-warning/10">
      {UNVERIFIED_FUNDING_TEXT}
    </p>
  );
}
