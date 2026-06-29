import Image from "next/image";
import Link from "next/link";
import { ChatBubbleIcon, WarningIcon } from "@/components/ui/icons";
import { buildWhatsAppLink } from "@/lib/contact";
import { formatMoney } from "@/lib/format";
import { safeMediaUrl } from "@/lib/url";
import type { ProjectCurrency, SaleProduct } from "@/types";

/**
 * Public, server-rendered product catalog. Each product shows its media (photo grid + an
 * optional short video), name, description and price, with two actions:
 *  - "Comprar" → the raffle-style order flow at /panel/product-order (requires sign-in and a
 *    VERIFIED school, since the payment methods are revealed there). A plain <Link>, so no
 *    client island is needed — quantity is chosen on the buy page.
 *  - "Consultar" → opens WhatsApp with a per-product message (the tour's "Preguntar" pattern).
 *
 * PURELY INFORMATIONAL: the platform never processes money. When the school isn't verified, a
 * single banner explains that buying unlocks after verification; "Consultar" still works.
 */
export function SaleProducts({
  products,
  currency,
  schoolId,
  toolId,
  schoolName,
  contactPhone,
  verified,
}: {
  products: SaleProduct[];
  currency: ProjectCurrency;
  schoolId: string;
  toolId: string;
  schoolName: string;
  /** Resolved WhatsApp number (sale.contactPhone ?? board phone), or "" when none. */
  contactPhone: string;
  /** Whether the school is verified — buying is only possible then (mirrors donations). */
  verified: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {!verified && (
        <div className="flex items-start gap-2 rounded-2xl bg-warning-tint p-4 text-sm text-warning ring-1 ring-warning/10">
          <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Vas a poder comprar en cuanto el equipo de escuelaplace verifique a la
            escuela y publique sus medios de pago. Mientras tanto puedes consultar.
          </p>
        </div>
      )}

      <ul className="grid gap-6 sm:grid-cols-2">
        {products.map((product) => {
          const photos = product.photos ?? [];
          // Host-gate the clip before it loads into a <video> (bypasses next/image): drop off-domain.
          const videoUrl = safeMediaUrl(product.videoUrl);
          const consultUrl = contactPhone
            ? buildWhatsAppLink(
                contactPhone,
                `¡Hola! Vi «${product.name}» de ${schoolName} en escuelaplace y quiero hacer una consulta.`,
              )
            : null;
          return (
            <li
              key={product.id}
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
                    {product.name}
                  </h3>
                  <p className="mt-1 text-lg font-semibold text-brand-darker tabular-nums">
                    {formatMoney(product.price, currency)}
                  </p>
                </div>

                {product.description && (
                  <p className="whitespace-pre-line text-sm text-muted">
                    {product.description}
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

                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {verified && (
                    <Link
                      href={`/panel/product-order?schoolId=${schoolId}&toolId=${toolId}&productId=${product.id}`}
                      className="btn btn-primary"
                    >
                      Comprar
                    </Link>
                  )}
                  {consultUrl && (
                    <a
                      href={consultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline"
                    >
                      <ChatBubbleIcon className="mr-1.5 h-5 w-5" />
                      Consultar
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
