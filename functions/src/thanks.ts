/**
 * Thank-you milestone helpers for the functions runtime.
 *
 * SOURCE OF TRUTH: `lib/thanks.ts` in the web app. Keep this in sync (the drift guard in
 * lib/thanks.test.ts fails if the copies diverge). This copy is intentionally dependency-free,
 * same pattern as ./ranking and ./donors.
 */
export type ThankYouMilestoneKind = "welcome" | "renewal" | "anniversary";

/** Mirror of THANK_YOU_NAME_TOKEN in types/firestore.ts. */
const NAME_TOKEN = "{nombre}";

/** Mirror of THANK_YOU_SPECIAL_YEARS_DEFAULT in types/firestore.ts. */
const SPECIAL_YEARS_DEFAULT: number[] = [1, 5];

/** Milliseconds in an average year (365.2425 days) so leap years don't drift the mark. */
export const YEAR_MS = 365.2425 * 86_400_000;

interface ThankYouTemplateLike {
  message: string;
  media?: { photoUrl?: string; videoUrl?: string };
}

interface ThankYouConfigLike {
  welcome?: ThankYouTemplateLike;
  renewal?: ThankYouTemplateLike;
  anniversaryGeneric?: ThankYouTemplateLike;
  specialYears?: number[];
}

/** Completed whole years between two epoch-ms instants — the anniversary count. */
export function completedYears(fromMs: number, nowMs: number): number {
  if (!(nowMs > fromMs)) return 0;
  return Math.floor((nowMs - fromMs) / YEAR_MS);
}

/** Whether an anniversary year is "special" (prompts a personal gesture, not a template). */
export function isSpecialThankYouYear(
  years: number,
  specialYears: number[],
): boolean {
  return specialYears.includes(years);
}

/** Substitute the supporter's name for every name token in a template. */
export function renderThankYou(message: string, name: string): string {
  return message.split(NAME_TOKEN).join((name ?? "").trim());
}

export interface ThankYouPlan {
  create: boolean;
  special: boolean;
  status: "sent" | "prompted";
  template: ThankYouTemplateLike | null;
}

/** Mirror of planThankYou in lib/thanks.ts — decide what a fired milestone produces. */
export function planThankYou(
  kind: ThankYouMilestoneKind,
  years: number,
  config: ThankYouConfigLike | null | undefined,
): ThankYouPlan {
  const specialYears = config?.specialYears ?? SPECIAL_YEARS_DEFAULT;
  const special =
    kind === "welcome" ||
    (kind === "anniversary" && isSpecialThankYouYear(years, specialYears));

  const template =
    kind === "welcome"
      ? config?.welcome
      : kind === "renewal"
        ? config?.renewal
        : special
          ? undefined
          : config?.anniversaryGeneric;

  if (template && template.message.trim()) {
    return { create: true, special, status: "sent", template };
  }
  return special
    ? { create: true, special, status: "prompted", template: null }
    : { create: false, special, status: "sent", template: null };
}
