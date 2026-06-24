"use client";

/**
 * The schools' presence on the /businesses CATALOG, interleaved into the business feed (rendered
 * as <RankedFeed>'s `interleave` slot, after the first business cards, so the page reads "top
 * businesses → schools → the rest"). The home (/) is the standalone school directory; this is the
 * lighter schools block that rides along the business catalog.
 *
 * It mirrors the established "SSR baseline + client personalization" pattern and switches content
 * by the buyer's localStorage community, which the server cannot see:
 *
 *  - No community → top schools by community SUPPORT (the SSR baseline; rankSchoolsByRelevance with
 *    no location collapses to the supporter order, so it is SEO-visible and correct on first paint)
 *    plus the "comercios que más escuelas apoyan" breadth carousel.
 *  - A LOCATION but no chosen school → the nearest schools (proximity re-rank after mount, pure
 *    math over the lat/lng already on each card — no Firestore read).
 *  - A CHOSEN school → that school's latest PUBLICATIONS (projects + tools, merged newest-first):
 *    a top list of schools loses meaning once the buyer picked theirs, so we show what's new there.
 *    These reads run client-side (public reads; the same cache()-wrapped helpers the panel calls).
 *
 * `initial` is a bounded candidate pool already ranked by support on the server; the carousel shows
 * SHOWN and keeps the rest as the proximity re-rank pool.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SchoolCard } from "@/components/school/SchoolCard";
import { ToolCard } from "@/components/tools/ToolCard";
import { CardCarousel } from "@/components/ui/Carousel";
import { useBuyerPreferences } from "@/lib/buyer/preferences";
import {
  getProjectsBySchool,
  getSchoolById,
  getToolsBySchool,
  publicTools,
  rankSchoolsByRelevance,
  schoolSupportersCount,
} from "@/lib/firestore";
import type { ProjectDoc, SchoolCardData, ToolDoc } from "@/types";

/** How many schools / publications the carousel shows. A carousel scrolls horizontally, so this
 *  can grow without the section taking the whole page (the candidate pool from the server bounds
 *  it). */
const SHOWN = 8;

/** A school publication for the chosen-school state: a project or a tool, merged by recency. */
type Publication =
  | { kind: "project"; at: number; project: ProjectDoc }
  | { kind: "tool"; at: number; tool: ToolDoc };

/** The chosen school's data, fetched after mount and keyed by its id. */
type ChosenSchool = {
  schoolId: string;
  schoolName: string;
  boardPhone?: string;
  items: Publication[];
};

function millis(ts: { toMillis?: () => number } | undefined): number {
  return ts?.toMillis?.() ?? 0;
}

export function CatalogSchools({ initial }: { initial: SchoolCardData[] }) {
  const { prefs, ready } = useBuyerPreferences();

  // A chosen school takes over the block; otherwise a location (if any) orders by proximity.
  const chosenSchoolId = ready ? prefs.schoolId : undefined;
  const nearby = ready && !chosenSchoolId && !!prefs.location;

  // States A/B — the top schools. Baseline (no location) is the server's support order; with a
  // location we re-rank by proximity (pure math over the lat/lng already on each card).
  const topSchools = useMemo(() => {
    const list =
      nearby && prefs.location
        ? rankSchoolsByRelevance(initial, { location: prefs.location }).map(
            (r) => r.school,
          )
        : initial;
    return list.slice(0, SHOWN);
  }, [initial, nearby, prefs.location]);

  // State C — the chosen school's latest publications. Fetched after mount, tagged with the id
  // they belong to. setState happens ONLY inside the async callback (never synchronously in the
  // effect body); render derives loading/failed by comparing these tags to the current id, so a
  // school switch shows a skeleton while refetching and a cleared school is ignored.
  const [chosen, setChosen] = useState<ChosenSchool | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!chosenSchoolId) return;
    let cancelled = false;
    (async () => {
      try {
        const [school, projects, tools] = await Promise.all([
          getSchoolById(chosenSchoolId),
          getProjectsBySchool(chosenSchoolId),
          getToolsBySchool(chosenSchoolId),
        ]);
        // Publications = active projects + active tools, newest first. Cancelled projects and
        // hidden tools (publicTools) are dropped, matching the school's public surfaces.
        const items: Publication[] = [
          ...projects
            .filter((p) => p.status !== "cancelled")
            .map((p) => ({
              kind: "project" as const,
              at: millis(p.createdAt),
              project: p,
            })),
          ...publicTools(tools).map((t) => ({
            kind: "tool" as const,
            at: millis(t.createdAt),
            tool: t,
          })),
        ]
          .sort((a, b) => b.at - a.at)
          .slice(0, SHOWN);
        if (cancelled) return;
        setChosen({
          schoolId: chosenSchoolId,
          schoolName: school?.name ?? prefs.schoolName ?? "tu escuela",
          boardPhone: school?.boardContact?.phone,
          items,
        });
      } catch {
        if (!cancelled) setFailedFor(chosenSchoolId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chosenSchoolId, prefs.schoolName]);

  if (initial.length === 0) return null;

  // ── Chosen-school state (C): latest publications ──────────────────────────────────────────
  if (chosenSchoolId) {
    // Only trust the tagged state when it matches the current id (a switch leaves stale data
    // briefly until the refetch settles).
    const data = chosen && chosen.schoolId === chosenSchoolId ? chosen : null;
    const failed = failedFor === chosenSchoolId;
    const name = data?.schoolName ?? prefs.schoolName ?? "tu escuela";

    return (
      <Section
        heading={`Lo último de ${name}`}
        subtext="Las publicaciones más recientes de la escuela que elegiste."
        footer={
          <FooterLink href={`/school/${chosenSchoolId}`}>
            Ver la página de la escuela
          </FooterLink>
        }
      >
        {failed && !data ? (
          <p className="mt-5 text-sm text-muted">
            No pudimos cargar las publicaciones de la escuela.
          </p>
        ) : !data ? (
          <CarouselSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyPublications schoolId={chosenSchoolId} name={name} />
        ) : (
          <div className="mt-5">
            <CardCarousel
              ariaLabel={`Publicaciones de ${name}`}
              items={data.items}
              getKey={(pub) =>
                pub.kind === "project"
                  ? `p-${pub.project.id}`
                  : `t-${pub.tool.id}`
              }
              renderItem={(pub) =>
                pub.kind === "project" ? (
                  <ProjectCard
                    project={pub.project}
                    showActions
                    boardPhone={data.boardPhone}
                  />
                ) : (
                  // ToolCard is feed-tuned but fills the carousel slide fine here.
                  <ToolCard tool={pub.tool} boardPhone={data.boardPhone} />
                )
              }
            />
          </div>
        )}
      </Section>
    );
  }

  // ── Top-schools states (A/B): community support, or proximity when located ────────────────
  const hasAnySupport = topSchools.some((s) => schoolSupportersCount(s) > 0);
  const heading = nearby
    ? "Escuelas cerca de ti"
    : hasAnySupport
      ? "Escuelas con más apoyo de la comunidad"
      : "Conoce las escuelas de tu comunidad";
  const subtext = nearby
    ? "Las instituciones educativas más cercanas a tu ubicación."
    : hasAnySupport
      ? "Las instituciones que más apoyo están recibiendo en la plataforma."
      : "Sumate a una de las instituciones educativas de la comunidad.";

  return (
    <Section
      heading={heading}
      subtext={subtext}
      footer={<FooterLink href="/schools">Ver todas las escuelas</FooterLink>}
    >
      <div className="mt-5">
        <CardCarousel
          ariaLabel={heading}
          items={topSchools}
          getKey={(school) => school.id}
          renderItem={(school) => <SchoolCard school={school} />}
        />
      </div>
    </Section>
  );
}

const HEADING_ID = "catalog-schools-heading";

function Section({
  heading,
  subtext,
  footer,
  children,
}: {
  heading: string;
  subtext: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={HEADING_ID} className="my-12">
      <h2
        id={HEADING_ID}
        className="text-lg font-semibold tracking-tight text-foreground"
      >
        {heading}
      </h2>
      <p className="mt-1 text-sm text-muted">{subtext}</p>
      {children}
      <div className="mt-6">{footer}</div>
    </section>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-darker hover:underline"
    >
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}

function CarouselSkeleton() {
  return (
    <div className="mt-5 flex gap-4 overflow-hidden" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-72 w-[80%] shrink-0 animate-pulse rounded-2xl bg-border/40 sm:w-[46%] lg:w-[31%]"
        />
      ))}
    </div>
  );
}

function EmptyPublications({
  schoolId,
  name,
}: {
  schoolId: string;
  name: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
      {name} todavía no tiene publicaciones.{" "}
      <Link
        href={`/school/${schoolId}`}
        className="font-medium text-brand-darker hover:underline"
      >
        Conocé su página
      </Link>
      .
    </div>
  );
}
