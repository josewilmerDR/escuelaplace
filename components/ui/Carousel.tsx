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

/** Each slide: ~1 visible on mobile (a peek of the next), ~2 on small, ~3 on desktop. */
const SLIDE = "snap-start shrink-0 w-[80%] sm:w-[46%] lg:w-[31%]";

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
    </div>
  );
}
