/**
 * Pure helpers for the donor/business "thank-you" milestones — no I/O, fully testable.
 *
 * The platform detects relationship moments (first support, renewals, N-year anniversaries)
 * and either auto-sends a template the school configured or PROMPTS the school to craft a
 * personal gesture. This file holds the decision (`planThankYou`) and the small math/string
 * helpers around it. The Cloud Function runtime keeps a dependency-free MIRROR in
 * functions/src/thanks.ts — keep the two in sync (a drift guard pins them, like ranking/donors).
 */
import {
  THANK_YOU_NAME_TOKEN,
  THANK_YOU_SPECIAL_YEARS_DEFAULT,
  type ThankYouConfig,
  type ThankYouMilestoneKind,
  type ThankYouTemplate,
} from "@/types";

/** Short Spanish label for a milestone — shared by the school queue and the donor card. */
export function thankYouMilestoneLabel(
  milestone: ThankYouMilestoneKind,
  years?: number,
): string {
  if (milestone === "welcome") return "Primera vez";
  if (milestone === "renewal") return "Renovación";
  return (years ?? 0) === 1 ? "1 año" : `${years ?? 0} años`;
}

/** Milliseconds in an average year (365.2425 days) so leap years don't drift the mark. */
export const YEAR_MS = 365.2425 * 86_400_000;

/**
 * Completed whole years between two epoch-ms instants — the anniversary count. Returns 0 when
 * `nowMs` is at or before `fromMs` (a not-yet-confirmed relationship has no anniversary).
 */
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

/**
 * Substitute the supporter's name for every name token in a template. A blank name collapses
 * the token to nothing (the school's own wording decides whether to use it at all).
 */
export function renderThankYou(message: string, name: string): string {
  return message.split(THANK_YOU_NAME_TOKEN).join((name ?? "").trim());
}

/** The outcome of evaluating a milestone against a school's config. */
export interface ThankYouPlan {
  /** Whether to create a thank-you record at all (generic milestones with no template skip). */
  create: boolean;
  /** Whether the product treats this milestone as special (welcome or a special anniversary). */
  special: boolean;
  /** `sent` when an auto-template delivers it; `prompted` when the school must personalize it. */
  status: "sent" | "prompted";
  /** The template that auto-sends it, or null when the school is being prompted. */
  template: ThankYouTemplate | null;
}

/**
 * Decide what to do when a milestone fires, given the school's thank-you config:
 * - `welcome` (special): auto-send the `welcome` template if set, else prompt the school.
 * - `renewal` (generic): auto-send the `renewal` template if set, else do nothing.
 * - `anniversary` on a SPECIAL year: always prompt the school for a personal gesture.
 * - `anniversary` on a generic year: auto-send `anniversaryGeneric` if set, else do nothing.
 *
 * The example copy the product shows schools is inspiration only; every delivered message is
 * the school's own words (a configured template) or one it writes for a prompt — never a
 * platform default.
 */
export function planThankYou(
  kind: ThankYouMilestoneKind,
  years: number,
  config: ThankYouConfig | null | undefined,
): ThankYouPlan {
  const specialYears = config?.specialYears ?? THANK_YOU_SPECIAL_YEARS_DEFAULT;
  const special =
    kind === "welcome" ||
    (kind === "anniversary" && isSpecialThankYouYear(years, specialYears));

  // The template that could auto-send this milestone (special anniversaries take no template —
  // they are always a personal gesture).
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
  // No auto-template: a special milestone prompts the school; a generic one is skipped.
  return special
    ? { create: true, special, status: "prompted", template: null }
    : { create: false, special, status: "sent", template: null };
}
