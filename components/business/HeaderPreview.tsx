"use client";

/**
 * Miniature of the public profile header (cover band + overlapping circular avatar),
 * for the panel forms where those images are chosen. The avatar circle covers part of
 * the cover's lower-left corner on the real page — without this preview the merchant
 * only finds out it hides a face after publishing. Accepts Files (create form, not
 * yet uploaded) or URLs (edit page) and mirrors the public fallback: no cover → logo
 * contained on the brand tint.
 */
import Image from "next/image";
import { useEffect, useMemo } from "react";

/** Resolve a File to a revocable object URL; string URLs pass through. */
function useImageUrl(source: File | string | null | undefined): string | null {
  const url = useMemo(() => {
    if (!source) return null;
    return typeof source === "string" ? source : URL.createObjectURL(source);
  }, [source]);
  useEffect(() => {
    if (url && typeof source !== "string") {
      return () => URL.revokeObjectURL(url);
    }
  }, [source, url]);
  return url;
}

export function HeaderPreview({
  cover,
  logo,
  businessName,
}: {
  cover?: File | string | null;
  logo?: File | string | null;
  /** Drives the initial shown in the avatar slot when there is no logo. */
  businessName: string;
}) {
  const coverUrl = useImageUrl(cover);
  const logoUrl = useImageUrl(logo);
  // Nothing chosen yet → no preview (an empty header band would just be noise).
  if (!coverUrl && !logoUrl) return null;

  const initial = businessName.trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Así se verá el encabezado</span>
      <span className="text-xs text-muted">
        El círculo del logo se superpone a la portada — revisá que no tape una
        cara ni un texto importante.
      </span>
      <div className="mt-1 max-w-md overflow-hidden rounded-xl border border-border bg-white">
        <div className="relative aspect-[5/2] w-full bg-brand-tint">
          {coverUrl ? (
            // unoptimized: the source may be a blob: object URL, which can't go
            // through the image optimizer. Fine for a small local preview.
            <Image
              src={coverUrl}
              alt=""
              fill
              unoptimized
              sizes="448px"
              className="object-cover"
            />
          ) : (
            logoUrl && (
              <Image
                src={logoUrl}
                alt=""
                fill
                unoptimized
                sizes="448px"
                className="object-contain p-6"
              />
            )
          )}
        </div>
        <div className="px-4 pb-3">
          <div className="relative z-10 -mt-9 w-fit">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={72}
                height={72}
                unoptimized
                className="h-18 w-18 rounded-full border border-border bg-white object-cover ring-2 ring-white"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-18 w-18 items-center justify-center rounded-full bg-brand-tint text-2xl font-bold text-brand-darker ring-2 ring-white"
              >
                {initial || "·"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
