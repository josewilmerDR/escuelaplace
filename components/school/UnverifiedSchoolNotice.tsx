/**
 * Inline "school not verified yet" notice for the funding/contribution flows. One copy
 * source so the project detail page and the /panel/fund flow read identically.
 */
export const UNVERIFIED_FUNDING_TEXT =
  "Esta escuela todavía no fue verificada por el equipo de escuelaplace. Vas a poder aportar a este proyecto en cuanto la verifiquemos.";

export function UnverifiedSchoolNotice() {
  return (
    <p className="rounded-xl bg-warning-tint p-3 text-sm text-warning ring-1 ring-warning/10">
      {UNVERIFIED_FUNDING_TEXT}
    </p>
  );
}
