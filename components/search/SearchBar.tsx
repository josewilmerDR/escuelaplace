"use client";

/**
 * Single-field catalog search ("¿Qué buscas?"). Unlike encuentra24 there is no
 * location field: the buyer's chosen school + location live in localStorage, so
 * results are ranked server-side (businesses donating to the buyer's school
 * first, then donors to other schools, then relevant non-donors).
 *
 * On submit it navigates to /search?q=<query>; the results page owns the ranking.
 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function SearchBar({
  autoFocus = false,
  initialQuery = "",
}: {
  autoFocus?: boolean;
  initialQuery?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initialQuery);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      // Empty submit: don't navigate, but don't be inert either — put the user where
      // the fix is (typing a query).
      inputRef.current?.focus();
      return;
    }
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    // Apple-style floating search field: a large, soft-shadowed white pill that lifts off
    // the hero. The whole form carries the focus ring (focus-within) so typing in the input
    // lights up the field as one unit, search button included.
    // role="search" makes the form a landmark screen-reader users can jump to.
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="Buscar comercios"
      className="flex w-full items-center gap-2 overflow-hidden rounded-2xl bg-white p-1.5 pl-5 shadow-xl ring-1 ring-black/5 transition focus-within:ring-2 focus-within:ring-brand"
    >
      {/* Leading magnifier echoes the native search look; decorative (the field is labelled). */}
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5 shrink-0 text-muted"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 3.473 9.765l3.13 3.13a.75.75 0 1 0 1.061-1.06l-3.13-3.131A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="¿Qué buscás? Ej: Panadería, Clases de Inglés"
        aria-label="¿Qué buscás?"
        className="min-w-0 flex-1 bg-transparent py-3 text-base text-foreground outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-brand-darker px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-darkest"
      >
        Buscar
      </button>
    </form>
  );
}
