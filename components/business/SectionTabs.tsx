"use client";

/**
 * FB-style section tab strip with a scroll-spy underline. Client island: the active
 * section depends on the viewer's scroll position. The tabs are plain # anchors, so
 * navigation works before hydration — the island only adds the highlight.
 */
import { useEffect, useState } from "react";

export interface SectionTab {
  /** DOM id of the section the tab anchors to (no leading #). */
  id: string;
  label: string;
}

export function SectionTabs({ sections }: { sections: SectionTab[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    // A section is "active" while it crosses a thin band near the top of the
    // viewport (20%–35% of its height) — where a heading sits right after an
    // anchor jump. The band is thinner than any section, so at most one fires.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Secciones de la página"
      className="-mx-2 mt-5 flex justify-center gap-1 border-t border-border pt-1 sm:justify-start"
    >
      {sections.map(({ id, label }) => {
        const isActive = id === active;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={isActive ? "true" : undefined}
            className={`relative rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "text-brand-darker after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand"
                : "text-muted hover:bg-surface hover:text-brand-darker"
            }`}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
