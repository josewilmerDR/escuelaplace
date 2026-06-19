import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { PageContainer } from "@/components/layout/PageContainer";
import { ToolManageBar } from "@/components/tools/ToolManageBar";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { cardClass } from "@/components/ui/Card";
import { ArrowRightIcon, ClockIcon } from "@/components/ui/icons";
import { getSchoolById, getToolById, toolWindowLabel } from "@/lib/firestore";
import { PAGE_COVER_SIZES } from "@/lib/layout";
import { toolTypeMeta } from "@/lib/tools/registry";
import { safeExternalUrl } from "@/lib/url";

/**
 * Public tool detail: /school/[id]/tool/[toolId]
 * SSR for SEO. A school "Herramienta" (rifa/venta/etc.): cover, kind, optional activity
 * window, description and an optional call-to-action LINK. Standalone (NOT under the school's
 * (profile) layout, mirroring the project detail page). PURELY INFORMATIONAL — the platform
 * never processes money; the CTA is a link the school controls (scheme-checked on write and
 * re-checked here before rendering).
 */

interface Props {
  params: Promise<{ id: string; toolId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, toolId } = await params;
  const tool = await getToolById(id, toolId);
  if (!tool) return { title: "Actividad no encontrada" };
  return {
    title: `${tool.title} · ${tool.schoolName}`,
    description: tool.description,
    // An inactive (hidden) tool stays reachable by direct URL but should not be indexed.
    ...(tool.status !== "active" ? { robots: { index: false } } : {}),
    openGraph: {
      title: tool.title,
      description: tool.description,
      type: "website",
      ...(tool.coverUrl ? { images: [tool.coverUrl] } : {}),
    },
    twitter: { card: tool.coverUrl ? "summary_large_image" : "summary" },
  };
}

export default async function ToolPage({ params }: Props) {
  const { id, toolId } = await params;
  const [tool, school] = await Promise.all([
    getToolById(id, toolId),
    getSchoolById(id),
  ]);
  if (!tool || !school) notFound();

  const Icon = toolTypeMeta(tool.type).icon;
  const window = toolWindowLabel(tool);
  // Re-check the CTA scheme at render even though it was sanitized on write (defense in depth).
  const ctaUrl = tool.cta ? safeExternalUrl(tool.cta.url) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: tool.title,
    description: tool.description,
    url: `https://escuelaplace.com/school/${id}/tool/${toolId}`,
    ...(tool.coverUrl ? { image: tool.coverUrl } : {}),
    organizer: { "@type": "Organization", name: school.name },
  };

  return (
    <PageContainer variant="detail">
      {/* "<" escaped so owner-controlled text can't close the script tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="text-sm">
        <span className="inline-flex py-2 -my-2">
          <BackLink href={`/school/${id}`}>{school.name}</BackLink>
        </span>
      </div>

      {/* Edit shortcut — only the school's managers see this. Client island that renders null
          for visitors, so it never shifts the SSR layout. */}
      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          Esta actividad no está activa por el momento, así que no aparece en la
          página de la escuela.
        </div>
      )}

      <article className={`mt-3 overflow-hidden ${cardClass("elevated", false)}`}>
        <div className="relative aspect-video w-full bg-brand-tint sm:aspect-[5/2]">
          {tool.coverUrl ? (
            <Image
              src={tool.coverUrl}
              alt=""
              fill
              priority
              sizes={PAGE_COVER_SIZES}
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full items-center justify-center text-brand-darker/30"
            >
              <Icon className="h-20 w-20" />
            </span>
          )}
        </div>

        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {tool.title}
            </h1>
            <ToolTypeBadge type={tool.type} />
          </div>

          {window && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <ClockIcon className="h-5 w-5 shrink-0" />
              {window}
            </p>
          )}

          {tool.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {tool.description}
            </p>
          )}

          {ctaUrl && (
            <div className="mt-6">
              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary justify-center px-8 py-3 text-base font-semibold"
              >
                {tool.cta?.label}
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </a>
              <p className="mt-2 text-xs text-muted">
                Coordiná directamente con la escuela. escuelaplace solo da
                visibilidad: nunca procesa pagos ni participa en la actividad.
              </p>
            </div>
          )}
        </div>
      </article>
    </PageContainer>
  );
}
