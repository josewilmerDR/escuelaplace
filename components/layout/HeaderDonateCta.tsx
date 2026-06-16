"use client";

/**
 * "Dona a una escuela" entry in the brand header — a secondary ghost chip (not a second
 * solid CTA competing with "Crear página"), so the mission of the platform is reachable from
 * every inner page without crowding the acquisition CTA.
 *
 * Hidden on home: there the 3-step value strip already carries a contextual "Donar" link
 * under the buyer's named community school (CommunityStep), so a second donate entry in the
 * same viewport would be redundant. Same rule as search/Categorías, which HeaderBrowse drops
 * on home because the hero already provides them.
 *
 * Donating requires an account (donorProfiles/subscriptions are keyed by uid), so an
 * anonymous buyer who taps this lands on /panel/donate's sign-in wall — which already carries
 * donor-oriented copy for exactly this public CTA (see RequireAuth). To warm up that cold
 * intent, we preselect the buyer's chosen community school (the only buyer state that exists —
 * localStorage, never Firestore): the donate form reads `?schoolId=` and lands preselected.
 *
 * Client island (like LoginButton/HeaderCreateCta) because it reads buyer preferences and the
 * route; the rest of SiteHeader stays a server component.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { HeartIcon } from "@/components/ui/icons";

// Ghost chip — same idiom as the browse chips (Escuelas/Categorías): white-on-brand with a
// soft inset ring, label hidden below sm to keep the narrow mobile band uncrowded.
const CHIP =
  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/15 hover:ring-white/50";

export function HeaderDonateCta() {
  const { prefs } = useBuyerPreferences();
  // On home the value strip owns the contextual donate link (see header note); drop the chip.
  if (usePathname() === "/") return null;
  // Carry the buyer's community school into the donate form when they've chosen one.
  const href = prefs.schoolId
    ? `/panel/donate?schoolId=${encodeURIComponent(prefs.schoolId)}`
    : "/panel/donate";

  return (
    <Link href={href} aria-label="Dona a una escuela" className={CHIP}>
      <HeartIcon className="h-5 w-5" />
      <span className="hidden sm:inline">Donar</span>
    </Link>
  );
}
