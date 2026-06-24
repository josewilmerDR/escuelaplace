"use client";

/**
 * The home feed when the buyer has chosen a specific school: instead of the school DIRECTORY
 * (see HomeSchools), it shows that one school's "publications" — its open projects and live
 * tools (rifas/ventas/etc.) merged newest-first — with the "comercios que la apoyan" carousel
 * interleaved after the first activity. It mirrors the school's own landing tab
 * (app/school/[id]/(profile)/page.tsx); the difference is only where the data comes from: the
 * chosen school lives in localStorage, unknown to the server, so this client island fetches
 * the publications + supporters after mount (the reads are React cache()'d helpers, fine on the
 * client) rather than receiving them as SSR props.
 */
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { SupportersCarousel } from "@/components/business/SupportersCarousel";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ToolCard } from "@/components/tools/ToolCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartIcon, WarningIcon } from "@/components/ui/icons";
import { FEED_COVER_SIZES } from "@/lib/layout";
import {
  getProjectsBySchool,
  getSchoolById,
  getSupportingBusinesses,
  getToolsBySchool,
  publicTools,
  toBusinessCardData,
} from "@/lib/firestore";
import type { BusinessCardData, ProjectDoc, ToolDoc } from "@/types";

/** A school publication: an open project or a live tool, tagged with its creation time so the
 *  two streams merge newest-first (mirrors the school landing's Publication type). */
type Publication =
  | { kind: "project"; at: number; project: ProjectDoc }
  | { kind: "tool"; at: number; tool: ToolDoc };

interface Loaded {
  name: string;
  boardPhone?: string;
  publications: Publication[];
  /** Slim teaser of supporting businesses; the full grid lives on the Comercios tab. */
  supporters: BusinessCardData[];
}

/** Cap the supporters teaser so the carousel stays a teaser, not a second listing (mirrors the
 *  school landing's TEASER_SUPPORTERS). */
const TEASER_SUPPORTERS = 8;

function millis(ts: { toMillis?: () => number } | undefined): number {
  return ts?.toMillis?.() ?? 0;
}

export function HomeChosenSchool({
  schoolId,
  schoolName,
}: {
  schoolId: string;
  /** The name from the buyer's prefs, shown while the full doc loads to avoid a flash. */
  schoolName?: string;
}) {
  const [state, setState] = useState<"loading" | "error" | "loaded">("loading");
  const [data, setData] = useState<Loaded | null>(null);

  // The parent keys this component by schoolId, so it remounts (state resets to loading) when
  // the buyer switches schools — no need to reset state synchronously here.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSchoolById(schoolId),
      getToolsBySchool(schoolId).catch(() => [] as ToolDoc[]),
      getProjectsBySchool(schoolId).catch(() => [] as ProjectDoc[]),
      getSupportingBusinesses(schoolId).catch(() => []),
    ])
      .then(([school, tools, projects, supporting]) => {
        if (cancelled) return;
        if (!school) {
          setState("error");
          return;
        }
        // Merge live tools and OPEN projects newest-first — the same current-calls-to-action
        // filter the school's own landing applies (publicTools drops inactive tools; only
        // `active` projects, so completed ones stay on the school's Proyectos tab).
        const publications: Publication[] = [
          ...publicTools(tools).map(
            (tool): Publication => ({ kind: "tool", at: millis(tool.createdAt), tool }),
          ),
          ...projects
            .filter((p) => p.status === "active")
            .map(
              (project): Publication => ({
                kind: "project",
                at: millis(project.createdAt),
                project,
              }),
            ),
        ].sort((a, b) => b.at - a.at);
        setData({
          name: school.name,
          boardPhone: school.boardContact?.phone,
          publications,
          supporters: supporting
            .slice(0, TEASER_SUPPORTERS)
            .map(toBusinessCardData),
        });
        setState("loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const name = data?.name ?? schoolName ?? "tu escuela";

  if (state === "error") {
    return (
      <EmptyState
        icon={<WarningIcon className="h-7 w-7" />}
        title="No pudimos cargar la escuela"
        description="Recargá la página para intentarlo de nuevo."
      />
    );
  }

  // The supporters shelf, interleaved after the first activity — buying from them is the
  // no-login way to help. A teaser; the full grid lives on the school's Comercios tab. null
  // when there are none, so nothing is inserted.
  const supportersShelf =
    data && data.supporters.length > 0 ? (
      <section aria-labelledby={SUPPORTERS_HEADING_ID}>
        <div className="flex items-baseline justify-between gap-4">
          <h3
            id={SUPPORTERS_HEADING_ID}
            className="text-base font-semibold tracking-tight text-foreground"
          >
            Comercios que la apoyan
          </h3>
          <Link
            href={`/school/${schoolId}/businesses`}
            className="shrink-0 text-sm font-medium text-brand-darker hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">
          Apoyá a la escuela comprándole a los comercios que ya la apoyan.
        </p>
        <div className="mt-4">
          <SupportersCarousel
            businesses={data.supporters}
            ariaLabel="Comercios que apoyan a la escuela"
          />
        </div>
      </section>
    ) : null;

  return (
    <section aria-labelledby={ACTIVITY_HEADING_ID}>
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id={ACTIVITY_HEADING_ID}
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Actividades de {name}
        </h2>
        <Link
          href={`/school/${schoolId}`}
          className="shrink-0 text-sm font-medium text-brand-darker hover:underline"
        >
          Ver escuela
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Proyectos, rifas, ventas y otras actividades que la escuela está
        organizando.
      </p>

      {state === "loading" ? (
        <p className="mt-6 text-sm text-muted">Cargando actividades…</p>
      ) : data && data.publications.length > 0 ? (
        <div className="mt-5 flex flex-col gap-5">
          {data.publications.map((pub, i) => (
            <Fragment
              key={
                pub.kind === "project" ? `p-${pub.project.id}` : `t-${pub.tool.id}`
              }
            >
              {pub.kind === "project" ? (
                <ProjectCard project={pub.project} coverSizes={FEED_COVER_SIZES} />
              ) : (
                <ToolCard tool={pub.tool} boardPhone={data.boardPhone} />
              )}
              {/* Interleave the supporters shelf between the first and second activity. */}
              {i === 0 && supportersShelf}
            </Fragment>
          ))}
        </div>
      ) : (
        // No live activity yet: point the buyer to the school's page, and still surface its
        // supporters if any.
        <>
          <EmptyState
            icon={<HeartIcon className="h-7 w-7" />}
            title="Esta escuela todavía no tiene actividades en curso"
            description="Conocé más sobre la institución y las formas de apoyarla en su página."
            cta={{ label: "Ver la escuela", href: `/school/${schoolId}` }}
          />
          {supportersShelf && <div className="mt-8">{supportersShelf}</div>}
        </>
      )}
    </section>
  );
}

const ACTIVITY_HEADING_ID = "home-chosen-school-activity-heading";
const SUPPORTERS_HEADING_ID = "home-chosen-school-supporters-heading";
