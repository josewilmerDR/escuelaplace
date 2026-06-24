"use client";

/**
 * A horizontal carousel of business cards — the slim teaser of a school's supporting
 * businesses on its landing tab (the full grid lives on the "Comercios" tab).
 *
 * A client island because <CardCarousel> takes a `renderItem` function, which can't cross
 * the server→client boundary: the server page passes only the serializable
 * BusinessCardData[], and this component supplies the render function on the client.
 */
import { BusinessCard } from "@/components/business/BusinessCard";
import { CardCarousel } from "@/components/ui/Carousel";
import type { BusinessCardData } from "@/types";

export function SupportersCarousel({
  businesses,
  ariaLabel,
}: {
  businesses: BusinessCardData[];
  ariaLabel: string;
}) {
  return (
    <CardCarousel
      items={businesses}
      ariaLabel={ariaLabel}
      getKey={(business) => business.id}
      renderItem={(business) => <BusinessCard business={business} />}
    />
  );
}
