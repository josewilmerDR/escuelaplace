import Link from "next/link";
import type { ReactNode } from "react";
import { GridIcon } from "@/components/ui/icons";
import type { CategoryDoc } from "@/types";

/**
 * How many category tiles the strip shows before the (optional) trailing "Todas las categorías"
 * link. The strip is a curated browse shortcut, not the exhaustive directory — that's what
 * /categories is — so it's capped.
 */
const CATEGORY_LIMIT = 10;

/**
 * Temporarily hide the trailing "Todas las categorías" tile: while the catalog still has few
 * businesses the strip already surfaces every rubro, so a "see all" shortcut is redundant. Flip
 * back to `true` once there are more categories than the strip shows; the /categories directory
 * stays reachable from elsewhere in the meantime.
 */
const SHOW_ALL_CATEGORIES_TILE = false;

/**
 * Compact, horizontally-scrollable strip of category tiles — the "browse by rubro" path pinned at
 * the top of the business catalog (/businesses). Each tile is a small square holding the category
 * glyph with its name captioned below (app-launcher style), so many rubros fit in a single row on
 * mobile without the chips wrapping into several lines. Shows the first CATEGORY_LIMIT categories
 * and — when SHOW_ALL_CATEGORIES_TILE is on — a trailing "Todas las categorías" tile linking to the
 * full /categories directory. The track is centered when it's narrower than the page and scrolls
 * from the start once it overflows (auto margins collapse to 0).
 *
 * Presentational + server-rendered (no client JS): the tiles are plain <Link>s, so they stay
 * crawlable and the page remains a server component. The scrollbar is hidden and the cut-off tiles
 * are the "there's more" affordance, matching the app's other compact strips (BingoCalledStrip).
 */
export function CategoryStrip({ categories }: { categories: CategoryDoc[] }) {
  return (
    <nav aria-label="Categorías">
      {/* Focusable scroll region (arrow keys scroll the overflow); no-scrollbar hides the bar and
          overscroll-x-contain keeps a flick at the ends from chaining to the page / back-gesture. */}
      <div
        role="group"
        tabIndex={0}
        className="no-scrollbar -mx-1 overflow-x-auto overscroll-x-contain px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-darker/40"
      >
        {/* mx-auto centers the track when it fits; on overflow the auto margins resolve to 0, so it
            still scrolls from the first tile. */}
        <ul className="mx-auto flex w-max items-start gap-3">
          {categories.slice(0, CATEGORY_LIMIT).map((c) => (
            <li key={c.id} className="shrink-0">
              <CategoryTile href={`/category/${c.id}`} label={c.name}>
                <span aria-hidden className="text-2xl leading-none">
                  {c.icon}
                </span>
              </CategoryTile>
            </li>
          ))}
          {SHOW_ALL_CATEGORIES_TILE && (
            // The "see all" shortcut to the full directory, in the brand fill.
            <li className="shrink-0">
              <CategoryTile href="/categories" label="Todas las categorías" emphasis>
                <GridIcon className="h-6 w-6" />
              </CategoryTile>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}

/**
 * One tile: a ~56px rounded square with the glyph, captioned below. `emphasis` paints the leading
 * "Todas" tile in the brand fill (white glyph needs --brand-darker behind it for WCAG AA). The
 * caption carries the name for assistive tech via the link's aria-label, so it isn't glyph-only.
 */
function CategoryTile({
  href,
  label,
  emphasis = false,
  children,
}: {
  href: string;
  label: string;
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="group flex w-16 flex-col items-center gap-1.5 text-center"
    >
      <span
        className={`grid h-14 w-14 place-items-center rounded-2xl ring-1 ring-inset transition ${
          emphasis
            ? "bg-brand-darker text-white ring-brand-dark/20 group-hover:bg-brand-darkest"
            : "bg-brand-tint/50 text-brand-darker ring-brand-dark/10 group-hover:bg-brand-tint group-hover:ring-brand"
        }`}
      >
        {children}
      </span>
      <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-muted group-hover:text-foreground">
        {label}
      </span>
    </Link>
  );
}
