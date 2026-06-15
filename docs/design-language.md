# Design language — "calm depth" (Apple-inspired)

The visual system for escuelaplace's UI. Apply it to every screen so the app feels like one
product. It is **presentation only** — never change behavior, data, props, copy meaning, or
accessibility to follow it.

## Principles

1. **Depth, not borders.** Separate surfaces with a soft hairline ring + a gentle shadow,
   not a hard 1px line. (`ring-1 ring-black/5 shadow-sm`, not `border`.)
2. **Room to breathe.** Generous, consistent spacing — `p-5` cards, `gap-4` lists,
   `mt-8`/`mt-10` between sections.
3. **Strong type hierarchy.** Big, tight titles; muted secondary text. `tracking-tight` on
   every heading. Let size + weight carry hierarchy, not color.
4. **One clear action per surface.** A single solid primary; everything else is quiet
   (ghost chips / text links).
5. **Restrained color.** White + slate neutrals carry the layout; the brand celeste is an
   accent (one primary button, one icon tile, one highlight), never a fill-everything.
6. **Soft geometry.** `rounded-2xl` containers, `rounded-xl` inner blocks, `rounded-lg`/`xl`
   controls. Consistency of radius reads as intentional.

## Tokens — use these, invent no new colors

- Brand: `brand`, `brand-dark`, `brand-darker`, `brand-darkest`, `brand-tint`
- Neutral: `background` (white), `surface` (slate-50), `border` (slate-200),
  `muted` (slate-500), `foreground` (slate-900)
- Semantic: `error`/`error-tint`, `success`/`success-tint`, `warning`/`warning-tint`
  (foreground token for text/icons, `-tint` for soft fills)

## Prefer the component over the class string

Most recipes below are now backed by a component. **Reach for the component first** — a
hand-copied class string drifts (the category chip silently became `py-2.5` while this doc
still said `py-2`); a component cannot. Use a raw recipe only where no component fits.

| Pattern | Component | Recipe it replaces |
|---|---|---|
| Page canvas + content column | `PageContainer` (`components/layout/PageContainer.tsx`) | the per-page `<main className="mx-auto max-w-…">` |
| Brand band (hero / search header) | `BrandBand` (`components/layout/BrandBand.tsx`) | the home/search brand sections |
| Profile header (cover + avatar + identity) | `ProfileHeader` (`components/layout/ProfileHeader.tsx`) | the business/school header block |
| Elevated surface | `Card` / `cardClass()` (`components/ui/Card.tsx`) | `rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5` |
| Titled section on a detail page | `Section` (`components/ui/Section.tsx`) | `mt-4 scroll-mt-6` + card + `<h2>` |
| Status / label pill (`text-xs`) | `Badge` (`components/ui/Badge.tsx`) | per-status pill palette |
| Metric / trust pill with icon (`text-sm`) | `StatChip` (`components/ui/StatChip.tsx`) | `rounded-full … px-3 py-1 text-sm ring-inset` |
| Pill nav chip (categories, filters) | `Chip` (`components/ui/Chip.tsx`) | `rounded-full border … px-4 py-2.5` |
| Empty state | `EmptyState` (`components/ui/EmptyState.tsx`) | centered icon-tile + title + line |
| Form field / titled form group | `Field` / `FormSection` (`components/ui/`) | label-wrapped control / `<fieldset>` |

## Layout — page widths & vertical rhythm

Every page shares ONE canvas width — `max-w-6xl`, the home column — so content edges line up
across the whole app. **Use `PageContainer`**; don't hand-pick widths. The variants no longer
differ in width, only in backdrop and vertical rhythm:

- **detail** — profile / detail pages (business, school, public project): gray canvas
  (`bg-surface min-h-screen`) behind elevated cards. `max-w-6xl px-4 py-6 sm:px-6`.
- **listing** — grids and result pages (home feed, search, category, schools): plain white
  body. `max-w-6xl px-6 py-10`.
- **narrow** — long-form text / single-column flows (about, create): `max-w-6xl px-6 py-12`
  (same width, just more vertical breathing room).
- **panel** — the private route group owns its own shell (`app/(panel)/layout.tsx`): the
  content box fills the canvas width beside the account sidebar (`flex-1`, no max-w cap),
  left-aligned. Panel pages must **not** add `mx-auto` or a max-w cap.

**Vertical rhythm on detail pages:** sibling sections are separated by `mt-4` and carry
`scroll-mt-6` (so a tab anchor clears the sticky header). `Section` bakes both in — don't
re-add them.

## Pills — two official sizes

There are exactly two pill sizes; don't invent a third.

- **`Badge`** — small status/label pill, `text-xs`, per-status fill. Verification, business
  /subscription/project status, donor tier. Its palette is shared and intentional.
- **`StatChip`** — larger metric/trust pill, `text-sm`, soft `-tint` fill + leading icon +
  inset ring. Inline signals like "N personas la apoyaron" or "confirma en ~X".

## Recipes — copy these class strings verbatim

(Where a component exists above, prefer it; these are for the gaps.)

- **Card (elevated):** `rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5` — or
  `Card` / `cardClass("elevated")`.
- **Selected/active card:** swap the ring → `ring-2 ring-brand shadow-md` —
  or `cardClass("selected")`.
- **Muted/inset panel:** `rounded-2xl bg-surface p-5 ring-1 ring-black/5` —
  or `cardClass("inset")`.
- **Icon tile (app-icon look):**
  `grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-brand-darker ring-1 ring-inset ring-brand-dark/10`
  with a sized icon child (`h-6 w-6`). Smaller variants: `h-9 w-9` + `h-5 w-5`.
- **Page title (h1):** `text-3xl font-semibold tracking-tight text-foreground`
- **Section title (h2):** `text-lg font-semibold tracking-tight text-foreground`
- **Muted line:** `text-sm text-muted`
- **Primary action:** the existing `.btn btn-primary` (radius softened globally — don't
  re-roll button colors)
- **Quiet chip action:** `inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground`
- **Semantic note/banner:** `rounded-xl bg-<sem>-tint p-3 text-xs text-<sem> ring-1 ring-<sem>/10`
  (sem = success | warning | error). Larger banners: `rounded-2xl ... p-4 text-sm`.
- **Pill nav chip (categories, filters):** prefer `Chip`. Raw:
  `rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted hover:border-brand-dark hover:text-brand-darker`

## Buttons & inputs

- Use the existing `.btn` / `.btn-primary` / `.btn-outline` / `.btn-secondary` /
  `.btn-on-brand` / `.btn-destructive` and `.input` primitives. Their radius is already
  softened globally in `globals.css` — do not hand-roll button/input colors or radius.
- One primary per surface. Secondaries are `.btn-outline` / `.btn-secondary` or quiet chips.

## Reference implementations

- `app/(panel)/panel/page.tsx` — **read it first** for the panel: shared heading, elevated
  cards, icon tiles, one primary + quiet chip actions, semantic notes, matching skeleton.
- `app/business/[slug]/page.tsx` and `app/school/[id]/page.tsx` — the canonical **detail
  pages**: `PageContainer variant="detail"`, `ProfileHeader`, `Section`, `Chip`, `StatChip`.
  When refactoring another detail/profile page, mirror these.

Match their patterns and comment style.

## Hard rules (do not break these)

- **Visual only.** Never change logic, hooks, data fetching, props, exported
  names/signatures, conditionals, routes, state, or the *meaning* of any Spanish copy.
- **Preserve comments** that explain non-obvious behavior. Only update a comment if your
  restyle makes it factually wrong.
- **Code & comments in English; on-screen copy in Spanish** (unchanged).
- **Accessibility is non-negotiable:** keep every `aria-*`, `sr-only`, `alt`, `role`, focus
  ring, and tap-target size (`min-h-10` ≈ 40px). Keep WCAG AA contrast — white text needs at
  least `brand-darker` behind it; semantic foreground tokens are AA on their `-tint`.
- **No new dependencies.** Use icons from `components/ui/icons.tsx`. If you need an icon that
  doesn't exist and you do NOT own `icons.tsx`, inline a one-off `<svg>` locally — do not
  edit `icons.tsx`.
- **Do not touch the Badge palette** (`components/ui/Badge.tsx`) — status pills are
  intentional and shared.
- **Stay in your lane:** edit only the files assigned to you. Do not run git, build, tests,
  or npm — a central step verifies everything afterward.
- It's fine to leave a file almost unchanged if it's already on-style or has no visual
  surface (pure logic). Don't force cosmetic churn.
