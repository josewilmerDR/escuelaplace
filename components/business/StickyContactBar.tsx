"use client";

import { useEffect, useRef, useState } from "react";
import { TrackedLink } from "@/components/business/TrackedLink";
import { WhatsAppIcon } from "@/components/ui/icons";

/**
 * Mobile-only sticky WhatsApp CTA for the public business profile. The profile's single
 * conversion is the "Consultar por WhatsApp" button in the header; once the visitor scrolls
 * past it, the only way to act is gone. This island re-surfaces it as a thumb-reachable bar —
 * but ONLY on mobile (`sm:hidden`; desktop keeps the header button in reach), ONLY when the
 * business published a WhatsApp number (the caller gates on `whatsAppUrl`), and ONLY after the
 * header CTA has scrolled out of view, so it never duplicates a button already on screen.
 *
 * It reuses TrackedLink with channel="whatsapp", so a tap here lands in the funnel exactly like
 * the header one. The bar is pinned ABOVE the BottomNav (its 4rem + safe-area inset), the one
 * other fixed element on mobile.
 *
 * Mount it right after the header ContactButtons: the in-flow sentinel it renders sits just
 * under the real CTA, so the IntersectionObserver flips the bar on at exactly the right scroll.
 */
export function StickyContactBar({
  businessId,
  whatsAppUrl,
}: {
  businessId: string;
  whatsAppUrl: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // Show once the sentinel (just under the header CTA) has scrolled ABOVE the viewport —
        // i.e. the real button is no longer visible. While it's still on screen (top >= 0) or
        // below the fold on first paint, stay hidden so there's never a duplicate CTA.
        setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* Zero-height sentinel marking where the header CTA sits in the flow — no layout impact. */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {/* `inert` (not just opacity) so the hidden bar leaves the tab order + a11y tree and can't
          swallow taps; the fade keeps it from popping in. */}
      <div
        inert={!show}
        className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2 transition-opacity duration-200 sm:hidden ${
          show ? "opacity-100" : "opacity-0"
        }`}
      >
        <TrackedLink
          businessId={businessId}
          channel="whatsapp"
          href={whatsAppUrl}
          external
          className="btn flex w-full justify-center bg-emerald-700 text-white shadow-lg hover:bg-emerald-800"
        >
          <WhatsAppIcon className="mr-2 h-4 w-4" />
          Consultar por WhatsApp
        </TrackedLink>
      </div>
    </>
  );
}
