"use client";

/**
 * Browse cluster of the brand header: catalog search + Categorías + Escuelas.
 *
 * Route-aware (a client island like LoginButton/HeaderCreateCta) so the bar doesn't
 * duplicate what the home page already shows prominently: the hero owns a large search
 * field and a category chip row, so on "/" both the embedded search and the Categorías
 * chip are hidden here.
 *
 * On mobile the whole browse cluster — search included — lives in the BottomNav, so below
 * sm the header shows nothing here. From sm up the embedded search bar grows to fill the gap
 * between the wordmark and the chips (Categorías, Escuelas), which appear to its right.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBar } from "@/components/search/SearchBar";
import { AcademicCapIcon, TagIcon } from "@/components/ui/icons";

// Ghost chip shared by the browse links: secondary nav (vs the solid white Crear CTA),
// white-on-brand with a soft inset ring + translucent hover. Browse destinations (search,
// Categorías, Escuelas) are mirrored in the mobile BottomNav, so in the header they only need
// to appear from sm up — below that the bottom bar carries them. The links render icon-only
// (label dropped to compact the header); the name lives in `title` + `aria-label`.
const DESKTOP_CHIP =
  "hidden sm:inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/15 hover:ring-white/50";

// Escuelas chip — desktop-only (the mobile BottomNav owns it below sm). Icon-only at every
// width (the label was dropped to compact the header); `title` + `aria-label` carry the name.
const SchoolsLink = (
  <Link
    href="/schools"
    aria-label="Ver escuelas"
    title="Escuelas"
    className={DESKTOP_CHIP}
  >
    <AcademicCapIcon className="h-5 w-5" />
  </Link>
);

export function HeaderBrowse() {
  const onHome = usePathname() === "/";

  // Home: the hero owns search + the category chips, so this collapses to a flex-1 spacer
  // (keeping Crear/Login pinned right) plus Escuelas.
  if (onHome) {
    return (
      <>
        <div className="flex-1" />
        {SchoolsLink}
      </>
    );
  }

  // Inner pages: from sm up the embedded search grows to fill the gap between the wordmark and
  // the chips. The flex-1 wrapper always occupies that gap so the chips stay right-aligned; on
  // sm+ it holds the input, on mobile it's an empty spacer (search now lives in the BottomNav).
  return (
    <>
      <div className="flex flex-1">
        <div className="hidden w-full sm:block">
          <SearchBar compact />
        </div>
      </div>
      <Link
        href="/categories"
        aria-label="Categorías"
        title="Categorías"
        className={DESKTOP_CHIP}
      >
        <TagIcon className="h-5 w-5" />
      </Link>
      {SchoolsLink}
    </>
  );
}
