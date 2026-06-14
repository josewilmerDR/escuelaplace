import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The brand-colored band at the top of marketing/search surfaces (home hero, search
 * header). One canonical recipe so the two stop diverging (home used `bg-brand` + photo
 * while search used a bare gradient): a celeste gradient, optionally with a community photo
 * tinted into a duotone via mix-blend-multiply, and a centered content column lifted off it.
 *
 * Layers when `image` is set (back to front): the photo (the LCP element — pass `priority`),
 * a brand-gradient duotone over it, and a soft fade at the bottom that blends into the white
 * body below. Without `image`, just the gradient.
 *
 * Sizes: "hero" is the tall landing band (home); "band" is the compact header (search).
 */
export function BrandBand({
  image,
  priority = false,
  size = "band",
  contentClassName = "",
  children,
}: {
  /** Optional background photo, rendered as a brand-tinted duotone. */
  image?: string;
  /** Set on the home hero — its photo is the LCP element. */
  priority?: boolean;
  size?: "hero" | "band";
  /** Layout classes for the inner content column (e.g. `text-center`). */
  contentClassName?: string;
  children: ReactNode;
}) {
  const pad = size === "hero" ? "py-20 sm:py-28" : "py-10";
  return (
    <section
      className={`relative isolate overflow-hidden ${
        image ? "bg-brand" : "bg-gradient-to-br from-brand to-brand-dark"
      }`}
    >
      {image && (
        <>
          <Image
            src={image}
            alt=""
            fill
            priority={priority}
            sizes="100vw"
            className="-z-20 object-cover"
          />
          {/* Brand gradient with mix-blend-multiply → duotone celeste tint over any photo. */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-br from-brand/85 to-brand-darker/90 mix-blend-multiply"
            aria-hidden
          />
          {/* Bottom fade for legibility + to blend into the white section below. */}
          <div
            className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-t from-white/15 to-transparent"
            aria-hidden
          />
        </>
      )}
      <div className={`mx-auto max-w-3xl px-6 ${pad} ${contentClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}
