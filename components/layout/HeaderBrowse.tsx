"use client";

/**
 * Browse cluster of the brand header: catalog search + Comercios + Categorías + Escuelas.
 *
 * Route-aware (a client island like LoginButton/HeaderCreateCta) so the bar doesn't
 * duplicate what the home page already shows prominently: the hero owns a large search
 * field and a category chip row, so on "/" the embedded search is hidden here.
 *
 * On mobile the whole browse cluster — search included — lives in the BottomNav, so below
 * sm the header shows nothing here. From sm up the embedded search bar (inner pages only)
 * grows to fill the gap between the wordmark and the chips.
 *
 * The chips carry their text label only on home — that's where the visitor first learns the
 * icon→name pairing, so the icon-only chips on inner pages stay legible afterwards. The chip
 * matching the current section is highlighted, giving desktop the same sense-of-place the
 * mobile BottomNav already gives (active tab) — see BottomNav for the mirrored match logic.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBar } from "@/components/search/SearchBar";
import { AcademicCapIcon, StorefrontIcon } from "@/components/ui/icons";

// Browse destinations, mirrored in the mobile BottomNav. `match` decides the active state from
// the current path — covering both the listing route and its public detail pages (e.g. Comercios
// stays active on /business/[slug]) — so the header reflects where the visitor is. Comercios
// leads: it is the catalog's central content. Categorías is reached from the home hero's chip
// row, so it stays out of this cluster to keep the header focused on the two catalog halves.
const CHIPS = [
  {
    href: "/businesses",
    label: "Comercios",
    Icon: StorefrontIcon,
    match: (p: string) => p.startsWith("/business"),
  },
  {
    href: "/schools",
    label: "Escuelas",
    Icon: AcademicCapIcon,
    match: (p: string) => p.startsWith("/school"),
  },
] as const;

// Ghost chip shared by the browse links: secondary nav (vs the solid white Crear CTA),
// white-on-brand with a soft inset ring + translucent hover. Browse destinations are mirrored in
// the mobile BottomNav, so in the header they only appear from sm up — below that the bottom bar
// carries them. The active destination gets a filled treatment (CHIP_ACTIVE) for sense-of-place.
const CHIP_BASE =
  "hidden sm:inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white ring-1 ring-inset transition-colors";
const CHIP_IDLE = "ring-white/30 hover:bg-white/15 hover:ring-white/50";
const CHIP_ACTIVE = "bg-white/20 ring-white/60";

// `withLabel` shows the name next to the icon (home only); inner pages render icon-only.
// `title` + `aria-label` always carry the name for the icon-only case; `aria-current` marks
// the active destination for assistive tech.
function BrowseChips({
  withLabel,
  pathname,
}: {
  withLabel: boolean;
  pathname: string;
}) {
  return (
    <>
      {CHIPS.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            title={label}
            className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            <Icon className="h-5 w-5" />
            {withLabel && label}
          </Link>
        );
      })}
    </>
  );
}

export function HeaderBrowse() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  // Home: the hero owns search, so this collapses to a flex-1 spacer (keeping Crear/Login
  // pinned right) plus the labeled browse chips.
  if (onHome) {
    return (
      <>
        <div className="flex-1" />
        <BrowseChips withLabel pathname={pathname} />
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
      <BrowseChips withLabel={false} pathname={pathname} />
    </>
  );
}
