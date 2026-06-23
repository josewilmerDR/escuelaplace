"use client";

/**
 * A horizontal, snap-scrolling track of equal-width slides with edge-fade "more" hints.
 *
 * One slide is mostly visible on mobile (with a peek of the next), ~2 on small screens and ~3 on
 * desktop, so a row of cards stays COMPACT — especially on mobile, where stacking the same cards
 * vertically would eat the screen — and the list can grow well past what fits without taking the
 * whole page. Mirrors the carousel in <SchoolPicker> (the donation picker) so the app's carousels
 * behave and look the same.
 *
 * The fade edges appear only when the track can scroll further that way, so a short list that
 * fits shows no fade and never looks "cut off".
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

/** Each slide: ~1 visible on mobile (a peek of the next), ~2 on small, ~3 on desktop. The mobile
 *  and small widths add a fixed +30px (via calc) on top of the percentage so cards run a touch
 *  wider — enough that the two footer buttons ("Consultar" + "Ver proyecto") stay on one row at
 *  the narrow breakpoints instead of wrapping. Desktop (lg) keeps the clean 3-up, where cards are
 *  already wide enough. The `[&>*]:h-full` stretches each card to fill the slide so a row of mixed
 *  cards (e.g. a tall project next to a short rifa) lines up to a uniform height — the flex track
 *  stretches every slide to the tallest, and this passes that height down to the card. */
const SLIDE =
  "snap-start shrink-0 w-[calc(80%_+_30px)] sm:w-[calc(46%_+_30px)] lg:w-[31%] [&>*]:h-full";

export function CardCarousel<T>({
  items,
  getKey,
  renderItem,
  ariaLabel,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  ariaLabel: string;
}) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setEdges({
      left: scrollLeft > 1,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  // Page the track ~one viewport at a time; snap-mandatory then settles it onto a slide edge.
  const scrollByPage = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  }, []);

  // Recompute the fades on scroll, on resize, and whenever the item count changes (the content
  // width changes without the container resizing).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      ro.disconnect();
    };
  }, [updateEdges, items.length]);

  return (
    <div className="relative">
      {/* -mx-1/px-1 so card shadows/rings aren't clipped by overflow; pb-2 leaves room for them
          under the track. no-scrollbar hides the bar — the fades signal there's more. */}
      <ul
        ref={scrollRef}
        role="list"
        aria-label={ariaLabel}
        className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
      >
        {items.map((item, i) => (
          <li key={getKey(item, i)} className={SLIDE}>
            {renderItem(item, i)}
          </li>
        ))}
      </ul>

      {edges.left && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {edges.right && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent"
        />
      )}

      {/* Prev/Next controls — icon only, shown only while the track can scroll that way (same
          signal as the fades). They sit above the fades (z-10, which is pointer-events-none) so
          clicks reach the button, not the card underneath. Hidden on mobile (sm:grid below): the
          peek of the next slide plus the edge fades are affordance enough, and a button would
          overlap the near-full-width single slide. */}
      {edges.left && (
        <CarouselButton side="left" onClick={() => scrollByPage(-1)} />
      )}
      {edges.right && (
        <CarouselButton side="right" onClick={() => scrollByPage(1)} />
      )}
    </div>
  );
}

function CarouselButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const left = side === "left";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={left ? "Anterior" : "Siguiente"}
      className={`absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-brand-darker shadow-md ring-1 ring-black/5 transition hover:bg-brand-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:grid ${
        left ? "left-1" : "right-1"
      }`}
    >
      {left ? (
        <ChevronLeftIcon className="h-5 w-5" />
      ) : (
        <ChevronRightIcon className="h-5 w-5" />
      )}
    </button>
  );
}
