# Hero background image

The home hero (`app/page.tsx`) uses `/public/hero.jpg` as a decorative,
brand-tinted background. Until you drop the file in, the hero falls back to the
solid brand color — nothing breaks.

## What to use

- **Subject:** local community + school. Costa Rican, real, warm — kids in
  school uniform, a neighborhood pulpería or feria, families. Avoid generic
  stock (corporate handshakes, US-looking classrooms).
- **Composition:** keep the center relatively clean/uncluttered — the headline
  and search bar sit on top of the center. Detail can live toward the edges.
- **It will be tinted celeste** (a brand gradient with `mix-blend-multiply`),
  so don't worry about the original colors; pick for content and contrast, not
  palette. Darker/mid-tone photos hold the white text best.

## Specs

- Filename: `hero.jpg` (this exact path).
- Landscape, ~2400×1400 px (covers wide screens without upscaling).
- Compress to keep it light (aim < ~300 KB) — it's above the fold and affects
  LCP/SEO. Tools: Squoosh, ImageOptim, or `sharp`.
- A `.webp` would be even lighter; if you use it, change the `backgroundImage`
  inline style in `app/page.tsx` from `/hero.jpg` to `/hero.webp`.
