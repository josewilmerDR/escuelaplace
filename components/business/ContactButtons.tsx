import {
  buildDirectionsUrl,
  buildFacebookUrl,
  buildInstagramUrl,
  buildPhoneUrl,
  buildWebsiteUrl,
  buildWhatsAppUrl,
  formatPhoneDisplay,
} from "@/lib/contact";
import { TrackedLink } from "@/components/business/TrackedLink";
import { WhatsAppIcon } from "@/components/ui/icons";
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
