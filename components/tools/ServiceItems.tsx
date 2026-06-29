import Image from "next/image";
import { ChatBubbleIcon } from "@/components/ui/icons";
import { buildWhatsAppLink } from "@/lib/contact";
import { formatMoney } from "@/lib/format";
import { safeMediaUrl } from "@/lib/url";
import {
  SERVICE_MODALITIES,
  SERVICE_MODALITY_LABELS,
  type ProjectCurrency,
  type ServiceItem,
} from "@/types";

/**
 * Public, server-rendered service catalog. Each service shows its media (photo grid + an optional
 * short video), name, description and — when set — its price, with a single action: a "Preguntar"
 * button that opens WhatsApp with a per-service message. Essentially the product catalog without
 * the "Comprar" order flow (and so without the verified gate — asking is just a chat). PURELY
 * INFORMATIONAL: the platform never processes money.
 */
export function ServiceItems({
  services,
  currency,
  schoolName,
  contactPhone,
}: {
  services: ServiceItem[];
  currency: ProjectCurrency;
  schoolName: string;
  /** Resolved WhatsApp number (service.contactPhone ?? board phone), or "" when none. */
  contactPhone: string;
}) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {services.map((service) => {
        const photos = service.photos ?? [];
        // Host-gate the clip before it loads into a <video> (bypasses next/image): drop off-domain.
        const videoUrl = safeMediaUrl(service.videoUrl);
        // Canonical order regardless of how the school toggled them.
        const modalities = SERVICE_MODALITIES.filter((m) =>
          service.modalities?.includes(m),
        );
        const askUrl = contactPhone
          ? buildWhatsAppLink(
              contactPhone,
              `¡Hola! Vi el servicio «${service.name}» de ${schoolName} en escuelaplace y quiero hacer una consulta.`,
            )
          : null;
        return (
          <li
            key={service.id}
            className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
          >
            {photos.length > 0 && (
              <ul className="grid grid-cols-2 gap-1">
                {photos.map((url) => (
                  <li
                    key={url}
                    className="relative block aspect-square overflow-hidden bg-surface"
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 25vw, 50vw"
                      className="object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-1 flex-col gap-3 p-5">
              <div>
                <h3 className="font-semibold tracking-tight text-foreground">
                  {service.name}
                </h3>
                {typeof service.price === "number" && (
                  <p className="mt-1 text-lg font-semibold text-brand-darker tabular-nums">
                    {service.priceFrom && (
                      <span className="mr-1 text-sm font-medium text-muted">
                        Desde
                      </span>
                    )}
                    {formatMoney(service.price, currency)}
                  </p>
                )}
              </div>

              {modalities.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {modalities.map((m) => (
                    <li
                      key={m}
                      className="inline-flex items-center rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-medium text-brand-darker"
                    >
                      {SERVICE_MODALITY_LABELS[m]}
                    </li>
                  ))}
                </ul>
              )}

              {service.description && (
                <p className="whitespace-pre-line text-sm text-muted">
                  {service.description}
                </p>
              )}

              {service.availability && (
                <p className="text-xs text-muted">
                  <span className="font-medium text-foreground">
                    Disponibilidad:
                  </span>{" "}
                  {service.availability}
                </p>
              )}

              {videoUrl && (
                <video
                  controls
                  preload="metadata"
                  className="w-full rounded-xl bg-black ring-1 ring-black/5"
                >
                  <source src={videoUrl} />
                  Tu navegador no puede reproducir este video.
                </video>
              )}

              {askUrl && (
                <div className="mt-auto pt-2">
                  <a
                    href={askUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    <ChatBubbleIcon className="mr-1.5 h-5 w-5" />
                    Consultar
                  </a>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
