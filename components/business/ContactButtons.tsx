import {
  buildCatalogUrl,
  buildDirectionsUrl,
  buildFacebookUrl,
  buildInstagramUrl,
  buildPhoneUrl,
  buildWebsiteUrl,
  buildWhatsAppUrl,
  formatPhoneDisplay,
} from "@/lib/contact";
import { TrackedLink } from "@/components/business/TrackedLink";
import type { BusinessContact, ContactChannel, Discount } from "@/types";

/**
 * Contact actions on the public business profile. Server component: only the leaf
 * anchors (TrackedLink) are client islands, reporting each click to the funnel
 * counters. Attribution itself does not depend on tracking — the prefilled WhatsApp
 * text tells the owner the customer came from escuelaplace, and the website UTM shows
 * up in the owner's own analytics.
 */
export function ContactButtons({
  businessId,
  businessName,
  contact,
  discount,
  coords,
}: {
  businessId: string;
  businessName: string;
  /** Optional: legacy docs created without any contact info lack the field entirely. */
  contact?: BusinessContact;
  discount?: Discount;
  /** Plain numbers (not a GeoPoint) so the props stay serializable for the client
   * islands. */
  coords?: { lat: number; lng: number } | null;
}) {
  const whatsAppUrl = contact?.whatsapp
    ? buildWhatsAppUrl(contact.whatsapp, businessName, discount?.active ?? false)
    : null;

  // Secondary actions, in decreasing order of intent. Every button requires a
  // merchant-entered value that survives normalization — no value (or an unusable
  // one) means no button, never a dead link. `external: false` marks links the OS
  // handles in place (tel:), which must not get target="_blank".
  const secondary: {
    href: string;
    label: string;
    channel: ContactChannel;
    external: boolean;
  }[] = [];
  // Catalog first: browsing products is the strongest intent after the chat itself.
  // The catalog lives in WhatsApp Business (we never host products) — see types.
  const catalogUrl = contact?.catalog ? buildCatalogUrl(contact.catalog) : null;
  if (catalogUrl)
    secondary.push({
      href: catalogUrl,
      label: "Ver catálogo",
      channel: "catalog",
      external: true,
    });
  // Both derive from the same normalization, so they are null together.
  const phoneUrl = contact?.phone ? buildPhoneUrl(contact.phone) : null;
  const phoneDisplay = contact?.phone ? formatPhoneDisplay(contact.phone) : null;
  if (phoneUrl && phoneDisplay)
    secondary.push({
      href: phoneUrl,
      // The number in the label: on desktop tel: often does nothing visible, so the
      // user must be able to read the number and dial it themselves.
      label: `Llamar ${phoneDisplay}`,
      channel: "phone",
      external: false,
    });
  const directionsUrl = coords
    ? buildDirectionsUrl(coords.lat, coords.lng)
    : null;
  if (directionsUrl)
    secondary.push({
      href: directionsUrl,
      label: "Cómo llegar",
      channel: "directions",
      external: true,
    });
  const websiteUrl = contact?.web ? buildWebsiteUrl(contact.web) : null;
  if (websiteUrl)
    secondary.push({
      href: websiteUrl,
      label: "Sitio web",
      channel: "website",
      external: true,
    });
  const instagramUrl = contact?.instagram
    ? buildInstagramUrl(contact.instagram)
    : null;
  if (instagramUrl)
    secondary.push({
      href: instagramUrl,
      label: "Instagram",
      channel: "instagram",
      external: true,
    });
  const facebookUrl = contact?.facebook
    ? buildFacebookUrl(contact.facebook)
    : null;
  if (facebookUrl)
    secondary.push({
      href: facebookUrl,
      label: "Facebook",
      channel: "facebook",
      external: true,
    });

  if (!whatsAppUrl && secondary.length === 0) {
    // The page's whole job is producing a contact: say why there are no buttons
    // instead of silently rendering nothing (which reads as a broken page).
    return (
      <p className="mt-4 text-center text-sm text-muted sm:text-left">
        Este comercio todavía no publicó datos de contacto.
      </p>
    );
  }

  return (
    // Centered on mobile / left on desktop, matching the FB-style profile header
    // (avatar and name center on small screens).
    <div className="mt-4 flex flex-wrap justify-center gap-3 sm:justify-start">
      {whatsAppUrl && (
        <TrackedLink
          businessId={businessId}
          channel="whatsapp"
          href={whatsAppUrl}
          external
          // WhatsApp-flavored green, darkened to emerald-700: white on WhatsApp's own
          // #25D366 is ~2:1, far below AA (see the contrast rules in globals.css).
          className="btn bg-emerald-700 text-white hover:bg-emerald-800"
        >
          <WhatsAppIcon className="mr-2 h-4 w-4" />
          Consultar por WhatsApp
        </TrackedLink>
      )}
      {secondary.map(({ href, label, channel, external }) => (
        <TrackedLink
          key={channel}
          businessId={businessId}
          channel={channel}
          href={href}
          external={external}
          className="btn btn-outline"
        >
          {label}
        </TrackedLink>
      ))}
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
