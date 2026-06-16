"use client";

/**
 * Acquisition CTA in the brand header. Unlike the rest of the header it depends on auth
 * state: it sends visitors to the public onboarding (/create) — which explains the platform
 * before asking them to create anything — and disappears for accounts that already manage a
 * page. Those owners create more pages from the panel, so a permanent global "create" button
 * is just noise for them (and for the buyer majority, who never own a page, it stays a way in
 * to learn what escuelaplace is).
 *
 * Client island (like LoginButton) because it reads useAuth(); the rest of SiteHeader stays
 * a server component.
 */
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

// Mobile keeps the page-owner reachable too (owners sign up from their phone): icon-only
// chip under sm, full label from sm up.
const CTA_CLASS = "btn btn-on-brand gap-1 font-semibold";

export function HeaderCreateCta() {
  const { user, loading } = useAuth();

  // While auth resolves, reserve the CTA's footprint with an invisible copy so the header
  // doesn't shift in the common case — anonymous visitors, who keep the CTA.
  if (loading) {
    return (
      <span aria-hidden className={`${CTA_CLASS} invisible`}>
        <span className="text-base leading-none">+</span>
        <span className="hidden sm:inline">Crear</span>
      </span>
    );
  }

  // Already an owner → the panel is their create path; drop the global acquisition CTA.
  if (user && user.managedPages.length > 0) return null;

  return (
    <Link href="/create" aria-label="Crear una página" className={CTA_CLASS}>
      <span aria-hidden className="text-base leading-none">
        +
      </span>
      <span className="hidden sm:inline">Crear página</span>
    </Link>
  );
}
