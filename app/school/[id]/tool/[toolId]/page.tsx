import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { PageContainer } from "@/components/layout/PageContainer";
import { BingoLivePublic } from "@/components/tools/BingoLivePublic";
import { EventStatusBadge } from "@/components/tools/EventStatusBadge";
import { RaffleBoard } from "@/components/tools/RaffleBoard";
import { SaleProducts } from "@/components/tools/SaleProducts";
import { ServiceItems } from "@/components/tools/ServiceItems";
import { ToolManageBar } from "@/components/tools/ToolManageBar";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { TourStages } from "@/components/tools/TourStages";
import { cardClass } from "@/components/ui/Card";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChatBubbleIcon,
  ClockIcon,
  FlagIcon,
  MapPinIcon,
} from "@/components/ui/icons";
import { buildWhatsAppLink } from "@/lib/contact";
import { googleCalendarUrl } from "@/lib/events";
import {
  getBingoCardAvailability,
  getBingoCards,
  getBingoOrdersByTool,
  getRaffleOrdersByTool,
  getSchoolById,
  getToolById,
  isSchoolVerified,
  raffleNumberStates,
  toolWindowLabel,
} from "@/lib/firestore";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { PAGE_COVER_SIZES } from "@/lib/layout";
import { toolTypeMeta } from "@/lib/tools/registry";
import { safeExternalUrl } from "@/lib/url";
import { BINGO_PATTERN_LABELS, type SchoolDoc, type ToolDoc } from "@/types";

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
    // The shared preview image is the colocated dynamic OG card (opengraph-image.tsx), which
    // composes the cover photo + title + a CTA — image-dominant by design. Next wires it in
    // automatically, so we must NOT set openGraph.images here (that would override it).
    openGraph: {
      title: tool.title,
      description: tool.description,
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ToolPage({ params }: Props) {
  const { id, toolId } = await params;
  const [tool, school] = await Promise.all([
    getToolById(id, toolId),
    getSchoolById(id),
  ]);
  if (!tool || !school) notFound();

  // A raffle has its own configured experience (prizes + the number grid + buy flow).
  if (tool.type === "raffle" && tool.raffle) {
    return <RaffleDetail id={id} toolId={toolId} tool={tool} school={school} />;
  }

  // A guided tour has its own configured experience (an ordered sequence of stages with media
  // + a WhatsApp "Preguntar" button).
  if (tool.type === "guided_tour" && tool.tour) {
    return <TourDetail id={id} toolId={toolId} tool={tool} school={school} />;
  }

  // A "Productos" catalog has its own configured experience (per-product media + price + the
  // Comprar/Consultar buttons).
  if (tool.type === "sale" && tool.sale) {
    return <SaleDetail id={id} toolId={toolId} tool={tool} school={school} />;
  }

  // A "Servicios" catalog: per-service media + optional price + a "Preguntar" WhatsApp button
  // (no order flow).
  if (tool.type === "service" && tool.service) {
    return <ServiceDetail id={id} toolId={toolId} tool={tool} school={school} />;
  }

  // A bingo: format + prizes per winning pattern + price + how many cartones are left + a
  // "Comprar cartones" button (the order flow, gated on a verified school).
  if (tool.type === "bingo" && tool.bingo) {
    return <BingoDetail id={id} toolId={toolId} tool={tool} school={school} />;
  }

  // An event: a dated one-off with a gallery, when/where, an "Agregar al calendario" link and a
  // "Preguntar" WhatsApp button.
  if (tool.type === "event" && tool.event) {
    return <EventDetail id={id} toolId={toolId} tool={tool} school={school} />;
  }

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

const PRIZE_LABELS = ["Primer premio", "Segundo premio", "Tercer premio"];

/**
 * The raffle's public experience: prizes + modalidad + the interactive 00–99 number grid. The
 * grid state (reserved/sold) is computed here on the server from the raffle's orders and handed
 * to the RaffleBoard client island, which owns selection and the handoff to the buy flow.
 */
async function RaffleDetail({
  id,
  toolId,
  tool,
  school,
}: {
  id: string;
  toolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
}) {
  const raffle = tool.raffle!;
  const orders = await getRaffleOrdersByTool(toolId).catch(() => []);
  const states = raffleNumberStates(orders, raffle.numberCount);
  const verified = isSchoolVerified(school);
  const Icon = toolTypeMeta(tool.type).icon;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: tool.title,
    description: tool.description,
    url: `https://escuelaplace.com/school/${id}/tool/${toolId}`,
    ...(tool.coverUrl ? { image: tool.coverUrl } : {}),
    ...(raffle.drawDate
      ? { startDate: raffle.drawDate.toDate().toISOString() }
      : {}),
    organizer: { "@type": "Organization", name: school.name },
  };

  return (
    <PageContainer variant="detail">
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

      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          Esta rifa no está activa por el momento, así que no aparece en la página
          de la escuela.
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

          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li className="flex items-start gap-2">
              <FlagIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Modalidad:</span>{" "}
                {raffle.drawMethod}
              </span>
            </li>
            {raffle.drawDate && (
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Sorteo:</span>{" "}
                  {formatDate(raffle.drawDate.toMillis())}
                </span>
              </li>
            )}
          </ul>

          {tool.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {tool.description}
            </p>
          )}

          {/* Prizes */}
          <div className={`mt-6 ${cardClass("inset")}`}>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Premios
            </h2>
            <ol className="mt-2 space-y-1 text-sm">
              {raffle.prizes.map((prize, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground">
                    {PRIZE_LABELS[i] ?? `Premio ${i + 1}`}:
                  </span>{" "}
                  <span className="text-muted">{prize}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Number grid + buy flow (client island) */}
          <div id="comprar" className="mt-8 scroll-mt-20">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Elegí tus números
            </h2>
            <p className="mt-1 text-sm text-muted">
              {formatMoney(raffle.pricePerNumber, raffle.currency)} cada número.
            </p>
            <div className="mt-4">
              <RaffleBoard
                schoolId={id}
                toolId={toolId}
                numberCount={raffle.numberCount}
                states={states}
                pricePerNumber={raffle.pricePerNumber}
                currency={raffle.currency}
                verified={verified}
              />
            </div>
          </div>
        </div>
      </article>
    </PageContainer>
  );
}

/**
 * The guided tour's public experience: the ordered sequence of stages (name + description +
 * photos + a short video), followed by a "Preguntar" button that opens WhatsApp. The number is
 * the tour's own contact when set, otherwise the school's board phone; the button is omitted
 * when neither resolves to a dialable number. PURELY INFORMATIONAL — it only opens a chat.
 */
async function TourDetail({
  id,
  toolId,
  tool,
  school,
}: {
  id: string;
  toolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
}) {
  const tour = tool.tour!;
  const Icon = toolTypeMeta(tool.type).icon;
  const window = toolWindowLabel(tool);

  // Prefer the tour's own WhatsApp contact; fall back to the school's board phone. buildWhatsAppLink
  // normalizes the number and returns null if it can't be dialed, so the button only shows when usable.
  const phone = tour.contactPhone || school.boardContact?.phone || "";
  const askMessage = `¡Hola! Vi la visita guiada "${tool.title}" de ${school.name} en escuelaplace y quiero hacer una consulta.`;
  const whatsappUrl = phone ? buildWhatsAppLink(phone, askMessage) : null;

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

      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          Esta visita guiada no está activa por el momento, así que no aparece en
          la página de la escuela.
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

          <div className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Recorrido
            </h2>
            <div className="mt-4">
              <TourStages stages={tour.stages} />
            </div>
          </div>

          {whatsappUrl && (
            <div className="mt-8">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary justify-center px-8 py-3 text-base font-semibold"
              >
                <ChatBubbleIcon className="mr-2 h-5 w-5" />
                Preguntar
              </a>
              <p className="mt-2 text-xs text-muted">
                Coordiná directamente con la escuela por WhatsApp. escuelaplace
                solo da visibilidad: nunca procesa pagos ni participa en la
                actividad.
              </p>
            </div>
          )}
        </div>
      </article>
    </PageContainer>
  );
}

/**
 * The "Productos" catalog public experience: each product (media + description + price) with a
 * "Comprar" button (the raffle-style order flow, gated on the school being verified) and a
 * "Consultar" WhatsApp button. PURELY INFORMATIONAL — the platform never processes the money.
 */
async function SaleDetail({
  id,
  toolId,
  tool,
  school,
}: {
  id: string;
  toolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
}) {
  const sale = tool.sale!;
  const Icon = toolTypeMeta(tool.type).icon;
  const verified = isSchoolVerified(school);
  const contactPhone = sale.contactPhone || school.boardContact?.phone || "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: tool.title,
    itemListElement: sale.products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        ...(p.photos && p.photos.length > 0 ? { image: p.photos[0] } : {}),
        offers: {
          "@type": "Offer",
          price: p.price,
          priceCurrency: sale.currency,
        },
      },
    })),
  };

  return (
    <PageContainer variant="detail">
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

      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          Estos productos no están activos por el momento, así que no aparecen en
          la página de la escuela.
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

          {tool.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {tool.description}
            </p>
          )}

          <div id="comprar" className="mt-8 scroll-mt-20">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Productos
            </h2>
            <div className="mt-4">
              <SaleProducts
                products={sale.products}
                currency={sale.currency}
                schoolId={id}
                toolId={toolId}
                schoolName={school.name}
                contactPhone={contactPhone}
                verified={verified}
              />
            </div>
          </div>
        </div>
      </article>
    </PageContainer>
  );
}

/**
 * The "Servicios" catalog public experience: each service (media + description + optional price)
 * with a single "Preguntar" WhatsApp button. No order flow and no verification gate — asking is
 * just a chat. PURELY INFORMATIONAL.
 */
async function ServiceDetail({
  id,
  toolId,
  tool,
  school,
}: {
  id: string;
  toolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
}) {
  const service = tool.service!;
  const Icon = toolTypeMeta(tool.type).icon;
  const contactPhone = service.contactPhone || school.boardContact?.phone || "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: tool.title,
    itemListElement: service.services.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: s.name,
        ...(s.description ? { description: s.description } : {}),
        ...(s.photos && s.photos.length > 0 ? { image: s.photos[0] } : {}),
        provider: { "@type": "Organization", name: school.name },
        ...(typeof s.price === "number"
          ? {
              offers: {
                "@type": "Offer",
                price: s.price,
                priceCurrency: service.currency,
              },
            }
          : {}),
      },
    })),
  };

  return (
    <PageContainer variant="detail">
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

      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          Estos servicios no están activos por el momento, así que no aparecen en
          la página de la escuela.
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

          {tool.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {tool.description}
            </p>
          )}

          <div className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Servicios
            </h2>
            <div className="mt-4">
              <ServiceItems
                services={service.services}
                currency={service.currency}
                schoolName={school.name}
                contactPhone={contactPhone}
              />
            </div>
          </div>
        </div>
      </article>
    </PageContainer>
  );
}

/**
 * An event's public experience: the gallery (photos + video), WHEN (date + a Próximo/Hoy/Finalizó
 * chip) and WHERE (a place + a "Cómo llegar" map link), an "Agregar al calendario" link, and a
 * single "Preguntar" WhatsApp button. Emits Event JSON-LD for search rich results. PURELY
 * INFORMATIONAL — nothing to pay; it only informs and links out.
 */
async function EventDetail({
  id,
  toolId,
  tool,
  school,
}: {
  id: string;
  toolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
}) {
  const event = tool.event!;
  const Icon = toolTypeMeta(tool.type).icon;
  const photos = event.photos ?? [];
  const contactPhone = event.contactPhone || school.boardContact?.phone || "";
  const dateMs = event.date ? event.date.toMillis() : null;
  // Re-check the map link scheme at render even though it was sanitized on write (defense in depth).
  const mapUrl = event.mapUrl ? safeExternalUrl(event.mapUrl) : null;
  const askUrl = contactPhone
    ? buildWhatsAppLink(
        contactPhone,
        `¡Hola! Vi el evento «${tool.title}» de ${school.name} en escuelaplace y quiero hacer una consulta.`,
      )
    : null;
  const calendarUrl = dateMs
    ? googleCalendarUrl({
        title: tool.title,
        details: tool.description,
        location: event.place,
        startMs: dateMs,
      })
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: tool.title,
    description: tool.description,
    url: `https://escuelaplace.com/school/${id}/tool/${toolId}`,
    ...(tool.coverUrl ? { image: tool.coverUrl } : photos[0] ? { image: photos[0] } : {}),
    ...(dateMs ? { startDate: new Date(dateMs).toISOString() } : {}),
    ...(event.place
      ? { location: { "@type": "Place", name: event.place } }
      : {}),
    organizer: { "@type": "Organization", name: school.name },
  };

  return (
    <PageContainer variant="detail">
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

      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          Este evento no está activo por el momento, así que no aparece en la página
          de la escuela.
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
            {dateMs && <EventStatusBadge dateMs={dateMs} />}
          </div>

          <ul className="mt-3 space-y-1 text-sm text-muted">
            {dateMs && (
              <li className="flex items-start gap-2">
                <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Cuándo:</span>{" "}
                  {formatDateTime(dateMs)}
                </span>
              </li>
            )}
            {event.place && (
              <li className="flex items-start gap-2">
                <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Dónde:</span>{" "}
                  {event.place}
                  {mapUrl && (
                    <>
                      {" · "}
                      <a
                        href={mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-darker hover:underline"
                      >
                        Cómo llegar
                      </a>
                    </>
                  )}
                </span>
              </li>
            )}
          </ul>

          {tool.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {tool.description}
            </p>
          )}

          {/* Gallery */}
          {photos.length > 0 && (
            <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((url) => (
                <li
                  key={url}
                  className="relative block aspect-square overflow-hidden rounded-xl bg-surface ring-1 ring-black/5"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 30vw, 50vw"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          )}

          {event.videoUrl && (
            <video
              controls
              preload="metadata"
              className="mt-4 w-full rounded-xl bg-black ring-1 ring-black/5"
            >
              <source src={event.videoUrl} />
              Tu navegador no puede reproducir este video.
            </video>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-wrap gap-3">
            {askUrl && (
              <a
                href={askUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                <ChatBubbleIcon className="mr-1.5 h-5 w-5" />
                Preguntar
              </a>
            )}
            {calendarUrl && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
              >
                <CalendarIcon className="mr-1.5 h-5 w-5" />
                Agregar al calendario
              </a>
            )}
          </div>
        </div>
      </article>
    </PageContainer>
  );
}

/**
 * The bingo's public experience: the cartón format, the prize per winning pattern, the price, how
 * many cartones are left, and a "Comprar cartones" button (the order flow, gated on a verified
 * school — buying means paying the school directly). PURELY INFORMATIONAL: the platform never
 * processes the money. The live event (called numbers, claims) is a later phase.
 */
async function BingoDetail({
  id,
  toolId,
  tool,
  school,
}: {
  id: string;
  toolId: string;
  tool: ToolDoc;
  school: SchoolDoc;
}) {
  const bingo = tool.bingo!;
  const [cards, orders] = await Promise.all([
    getBingoCards(id, toolId).catch(() => []),
    getBingoOrdersByTool(toolId).catch(() => []),
  ]);
  const availability = getBingoCardAvailability(cards, orders);
  const verified = isSchoolVerified(school);
  const Icon = toolTypeMeta(tool.type).icon;
  const buyHref = `/panel/bingo-order?schoolId=${id}&toolId=${toolId}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: tool.title,
    description: tool.description,
    url: `https://escuelaplace.com/school/${id}/tool/${toolId}`,
    ...(tool.coverUrl ? { image: tool.coverUrl } : {}),
    ...(bingo.eventDate
      ? { startDate: bingo.eventDate.toDate().toISOString() }
      : {}),
    organizer: { "@type": "Organization", name: school.name },
  };

  return (
    <PageContainer variant="detail">
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

      <ToolManageBar
        schoolId={id}
        toolId={toolId}
        ownerId={school.ownerId}
        editorIds={school.editorIds}
      />

      {tool.status !== "active" && (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
          Este bingo no está activo por el momento, así que no aparece en la página
          de la escuela.
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

          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li className="flex items-start gap-2">
              <FlagIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Cartón:</span>{" "}
                {bingo.format.rows}×{bingo.format.cols} · números{" "}
                {bingo.format.poolMin}–{bingo.format.poolMax}
              </span>
            </li>
            {bingo.drawMethod && (
              <li className="flex items-start gap-2">
                <FlagIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Modalidad:</span>{" "}
                  {bingo.drawMethod}
                </span>
              </li>
            )}
            {bingo.eventDate && (
              <li className="flex items-start gap-2">
                <ClockIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Evento:</span>{" "}
                  {formatDate(bingo.eventDate.toMillis())}
                </span>
              </li>
            )}
          </ul>

          {tool.description && (
            <p className="mt-3 whitespace-pre-line text-muted">
              {tool.description}
            </p>
          )}

          {/* Prizes */}
          <div className={`mt-6 ${cardClass("inset")}`}>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Premios
            </h2>
            {bingo.prizes ? (
              <ol className="mt-2 space-y-1 text-sm">
                <li>
                  <span className="font-medium text-foreground">Premio mayor:</span>{" "}
                  <span className="text-muted">{bingo.prizes.first}</span>
                </li>
                {bingo.prizes.second && (
                  <li>
                    <span className="font-medium text-foreground">
                      Segundo premio:
                    </span>{" "}
                    <span className="text-muted">{bingo.prizes.second}</span>
                  </li>
                )}
                {bingo.prizes.third && (
                  <li>
                    <span className="font-medium text-foreground">
                      Tercer premio:
                    </span>{" "}
                    <span className="text-muted">{bingo.prizes.third}</span>
                  </li>
                )}
                {bingo.prizes.others.map((prize, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">Otro premio:</span>{" "}
                    <span className="text-muted">{prize}</span>
                  </li>
                ))}
              </ol>
            ) : (
              // Legacy bingo: prizes used to be attached to each winning pattern.
              <ol className="mt-2 space-y-1 text-sm">
                {bingo.patterns.map((p) => (
                  <li key={p.pattern}>
                    <span className="font-medium text-foreground">
                      {BINGO_PATTERN_LABELS[p.pattern]}:
                    </span>{" "}
                    <span className="text-muted">{p.prize}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-muted">
              La forma de ganar (línea, cartón lleno, etc.) la anuncia la escuela al
              iniciar cada ronda del bingo en vivo.
            </p>
          </div>

          {/* Price + availability + buy */}
          <div id="comprar" className="mt-8 scroll-mt-20">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Comprá tus cartones
            </h2>
            <p className="mt-1 text-sm text-muted">
              {formatMoney(bingo.pricePerCard, bingo.currency)} cada cartón ·{" "}
              {availability.available > 0
                ? `${availability.available} de ${availability.total} disponibles`
                : availability.total > 0
                  ? "agotados por ahora"
                  : "todavía sin cartones"}
            </p>
            <div className="mt-4">
              {!verified ? (
                <p className="rounded-xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
                  La compra se habilita cuando la escuela esté verificada.
                </p>
              ) : availability.available > 0 ? (
                <Link href={buyHref} className="btn btn-primary">
                  Comprar cartones
                  <ArrowRightIcon className="ml-1.5 h-5 w-5" />
                </Link>
              ) : (
                <p className="rounded-xl bg-surface p-4 text-sm text-muted ring-1 ring-black/5">
                  No hay cartones disponibles por el momento.
                </p>
              )}
            </div>
          </div>

          {/* Live event (streams in real time once the school starts the game). */}
          <BingoLivePublic
            schoolId={id}
            toolId={toolId}
            poolMin={bingo.format.poolMin}
            poolMax={bingo.format.poolMax}
          />
        </div>
      </article>
    </PageContainer>
  );
}
