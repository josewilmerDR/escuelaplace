/**
 * Contact-channel helpers for business profiles.
 *
 * WhatsApp is the attribution backbone of the platform: the prefilled message makes the
 * customer open the chat already saying they found the business on escuelaplace, so the
 * owner can verify referrals in their own phone without trusting our dashboards.
 */

/**
 * Normalize a merchant-entered phone number to international digits (country code, no
 * "+", no separators) — the shape wa.me expects and tel: links build on. Owners type
 * numbers in many shapes ("8888-8888", "+506 8888 8888"); Costa Rican numbers are 8
 * digits, so those get the 506 country code prepended. Longer numbers are assumed to
 * already carry a country code. Returns null when the input can't be a dialable number.
 */
export function normalizePhoneInternational(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2); // international call prefix
  if (digits.length === 8) return `506${digits}`; // local CR number
  if (digits.length >= 10 && digits.length <= 15) return digits; // E.164 allows up to 15
  return null;
}

/**
 * Prefilled chat opener. Mentioning escuelaplace (and the discount, when there is one)
 * is deliberate: it is the attribution signal the owner sees in their own WhatsApp, and
 * it trains the customer to ask for the discount by name at the counter.
 */
export function whatsAppMessage(
  businessName: string,
  hasDiscount: boolean,
): string {
  return hasDiscount
    ? `¡Hola! Vi ${businessName} en escuelaplace y quiero aprovechar el descuento.`
    : `¡Hola! Vi ${businessName} en escuelaplace y quiero hacer una consulta.`;
}

/** wa.me deep link with the prefilled opener, or null if the number is unusable. */
export function buildWhatsAppUrl(
  rawPhone: string,
  businessName: string,
  hasDiscount: boolean,
): string | null {
  const phone = normalizePhoneInternational(rawPhone);
  if (!phone) return null;
  const text = encodeURIComponent(whatsAppMessage(businessName, hasDiscount));
  return `https://wa.me/${phone}?text=${text}`;
}

/**
 * WhatsApp Business catalog link. Owners enter either the wa.me/c/… share link the
 * WhatsApp Business app gives them, or just the number that hosts the catalog —
 * normalize both to https://wa.me/c/<number>. The catalog lives entirely in WhatsApp
 * (the platform hosts no products); this is a browse-and-ask channel, never checkout.
 * Returns null when the input is neither a catalog link nor a dialable number.
 */
export function buildCatalogUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const linkMatch = trimmed.match(/wa\.me\/c\/([A-Za-z0-9]+)/i);
  if (linkMatch) return `https://wa.me/c/${linkMatch[1]}`;
  const phone = normalizePhoneInternational(trimmed);
  return phone ? `https://wa.me/c/${phone}` : null;
}

/** tel: link for the least attributable but still demanded channel: the plain call. */
export function buildPhoneUrl(rawPhone: string): string | null {
  const phone = normalizePhoneInternational(rawPhone);
  return phone ? `tel:+${phone}` : null;
}

/** wa.me deep link carrying an arbitrary prefilled message, or null if the number is
 * unusable. Generic counterpart to buildWhatsAppUrl (which prefills the business opener). */
export function buildWhatsAppLink(rawPhone: string, message: string): string | null {
  const phone = normalizePhoneInternational(rawPhone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** mailto: link with a prefilled subject and body (manual encoding so spaces don't become
 * "+", which some mail clients render literally in the body). */
export function buildMailtoLink(
  email: string,
  subject: string,
  body: string,
): string {
  return `mailto:${email}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

/**
 * Prefilled reminder a supporter sends a school's board to nudge a still-pending
 * confirmation. The school confirms against its OWN records; the platform never asserts the
 * money moved — this is just a courtesy poke through the channel the school published.
 */
export function confirmationReminderMessage(
  supporterName: string,
  schoolName: string,
): string {
  return `¡Hola! Soy ${supporterName}. Registré un aporte para ${schoolName} en escuelaplace y todavía figura como pendiente. ¿Lo podrían confirmar cuando puedan? ¡Muchas gracias!`;
}

/**
 * Human-readable form of the number for the call button's label: desktop browsers
 * often do nothing useful with tel:, so showing the number lets the user dial (or jot
 * it down) manually. CR numbers read the way locals write them (+506 8888 8888);
 * anything else stays as +E.164.
 */
export function formatPhoneDisplay(rawPhone: string): string | null {
  const phone = normalizePhoneInternational(rawPhone);
  if (!phone) return null;
  if (phone.length === 11 && phone.startsWith("506")) {
    return `+506 ${phone.slice(3, 7)} ${phone.slice(7)}`;
  }
  return `+${phone}`;
}

/** Google Maps directions to the business. A directions request is the strongest
 * visit-intent signal a physical business gets, second only to a chat. */
export function buildDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Owner's website with UTM attribution appended, so referrals show up in THEIR
 * analytics — third-party verifiable, not platform-claimed. UTM goes only on the
 * owner's own site: Instagram/Facebook profile pages expose no referral analytics
 * to the owner, so params there would be dead weight.
 *
 * Owners type bare domains ("miweb.com"), so a missing protocol gets https. Returns
 * null when the input can't be a public URL (no parse, or a hostname without a dot).
 */
export function buildWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  if (!url.hostname.includes(".")) return null;
  url.searchParams.set("utm_source", "escuelaplace");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}

/** Instagram handles allow letters, digits, dots and underscores. */
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]+$/;
/** Facebook page slugs additionally allow hyphens (e.g. "Libreria-Alfa-12345"). */
const FACEBOOK_HANDLE = /^[A-Za-z0-9.-]+$/;

/**
 * Owners enter social profiles as a handle ("@libreria.alfa"), a bare username, or a
 * full URL — normalize all three. Returns null for input that is none of those.
 */
export function buildInstagramUrl(raw: string): string | null {
  return buildSocialUrl(raw, INSTAGRAM_HANDLE, "https://www.instagram.com/");
}

export function buildFacebookUrl(raw: string): string | null {
  return buildSocialUrl(raw, FACEBOOK_HANDLE, "https://www.facebook.com/");
}

function buildSocialUrl(
  raw: string,
  handlePattern: RegExp,
  base: string,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed; // owner pasted the full URL
  const handle = trimmed.replace(/^@/, "");
  if (!handle || !handlePattern.test(handle)) return null;
  return `${base}${handle}`;
}
