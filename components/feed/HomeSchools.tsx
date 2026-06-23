"use client";

/**
 * The home's school DIRECTORY: a single vertical column of school "post" cards (mobile and
 * desktop alike — never a grid), with the "los comercios que más escuelas apoyan" carousel
 * pinned at the SECOND slot (right after the first school) so the businesses keep a guaranteed,
 * high-attention spot in the feed (the FB "suggested" interleave pattern).
 *
 * SSR baseline + client personalization: the server passes `initial` already ranked by community
 * support (the SEO order, shown on first paint). After mount, a buyer LOCATION re-ranks by
 * proximity and a CHOSEN school is pinned to the top — pure math over each card's lat/lng, no
 * Firestore read. "Ver solo la actividad de una escuela" stays its own page (/school/[id]).
 */
import { Fragment, useMemo } from "react";
import Link from "next/link";
import { BusinessCard } from "@/components/business/BusinessCard";
import { SchoolCard } from "@/components/school/SchoolCard";
import { CardCarousel } from "@/components/ui/Carousel";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import { rankSchoolsByRelevance, schoolSupportersCount } from "@/lib/firestore";
import type { SupportedSchool } from "@/lib/firestore";
import type { BusinessCardData, SchoolCardData } from "@/types";

/** A business card plus the schools it supports, for the breadth carousel (serializable). */
export interface SupportingBusinessCard {
  business: BusinessCardData;
  supportedSchools: SupportedSchool[];
}

/** How many schools the stacked directory shows; the rest stay as the proximity re-rank pool. */
const SHOWN = 12;

export function HomeSchools({
  initial,
  supportingBusinesses = [],
}: {
  initial: SchoolCardData[];
  /** Top businesses by support breadth, server-ranked; shown as the carousel at slot 2. */
  supportingBusinesses?: SupportingBusinessCard[];
}) {
  const { prefs, ready } = useBuyerPreferences();

  const chosenSchoolId = ready ? prefs.schoolId : undefined;
  const hasLocation = ready && !!prefs.location;

  // Order the directory: the server's support baseline, unless a location re-ranks it by
  // proximity; a chosen school is pinned to the very top so "tu escuela" leads.
  const schools = useMemo(() => {
    let list =
      hasLocation && prefs.location
        ? rankSchoolsByRelevance(initial, { location: prefs.location }).map(
            (r) => r.school,
          )
        : initial;
    if (chosenSchoolId) {
      const chosen = list.find((s) => s.id === chosenSchoolId);
      if (chosen) list = [chosen, ...list.filter((s) => s.id !== chosenSchoolId)];
    }
    return list.slice(0, SHOWN);
  }, [initial, hasLocation, prefs.location, chosenSchoolId]);

  if (schools.length === 0) return null;

  const hasAnySupport = schools.some((s) => schoolSupportersCount(s) > 0);
  const heading = hasLocation
    ? "Escuelas cerca de ti"
    : hasAnySupport
      ? "Escuelas con más apoyo de la comunidad"
      : "Conocé las escuelas de tu comunidad";
  const subtext = hasLocation
    ? "Las instituciones educativas más cercanas a tu ubicación."
    : hasAnySupport
      ? "Las instituciones que más apoyo están recibiendo en la plataforma."
      : "Sumate a una de las instituciones educativas de la comunidad.";

  // The businesses shelf, pinned at slot 2. Heading-led on the page background (no card wrapper)
  // so the carousel's edge fades — which assume the page background — stay seamless. null when no
  // business supports any school yet.
  const businessesShelf =
    supportingBusinesses.length > 0 ? (
      <section aria-labelledby={BUSINESSES_HEADING_ID}>
        <div className="flex items-baseline justify-between gap-4">
          <h3
            id={BUSINESSES_HEADING_ID}
            className="text-base font-semibold tracking-tight text-foreground"
          >
            Los comercios que más escuelas apoyan
          </h3>
          <Link
            href="/businesses"
            className="shrink-0 text-sm font-medium text-brand-darker hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">
          Comprándoles, apoyás a las escuelas que cada uno sostiene.
        </p>
        <div className="mt-4">
          <CardCarousel
            ariaLabel="Los comercios que más escuelas apoyan"
            items={supportingBusinesses}
            getKey={(item) => item.business.id}
            renderItem={(item) => (
              <BusinessCard
                business={item.business}
                supportedSchools={item.supportedSchools}
              />
            )}
          />
        </div>
      </section>
    ) : null;

  return (
    <section aria-labelledby={SCHOOLS_HEADING_ID}>
      <h2
        id={SCHOOLS_HEADING_ID}
        className="text-lg font-semibold tracking-tight text-foreground"
      >
        {heading}
      </h2>
      <p className="mt-1 text-sm text-muted">{subtext}</p>

      {/* Single vertical column on every breakpoint — school "posts" stacked top to bottom. */}
      <div className="mt-5 flex flex-col gap-5">
        {schools.map((school, i) => (
          <Fragment key={school.id}>
            <SchoolCard school={school} />
            {/* Businesses pinned at the SECOND slot, right after the first school. */}
            {i === 0 && businessesShelf}
          </Fragment>
        ))}
      </div>

      <div className="mt-8">
        <Link
          href="/schools"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-darker hover:underline"
        >
          Ver todas las escuelas
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}

const SCHOOLS_HEADING_ID = "home-schools-heading";
const BUSINESSES_HEADING_ID = "home-supporting-businesses-heading";
