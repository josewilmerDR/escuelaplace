"use client";

/**
 * Single-field catalog search ("¿Qué buscas?"). Unlike encuentra24 there is no
 * location field: the buyer's chosen school + location live in localStorage, so
 * results are ranked server-side (businesses donating to the buyer's school
 * first, then donors to other schools, then relevant non-donors).
 *
 * On submit it navigates to /search?q=<query>; the results page owns the ranking.
 */
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function SearchBar({
  autoFocus = false,
  initialQuery = "",
  originPath = "",
}: {
  autoFocus?: boolean;
  initialQuery?: string;
  // Where the search was launched from, threaded through the /search?from=… param so that
  // clearing the filter returns the user to that page. Only the results page passes it
  // (read from the URL); on other surfaces the origin is the current pathname.
  originPath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
    // Remember where this search was launched from so a later "clear" returns there. When
    // re-searching from the results page itself, keep the original origin (don't overwrite
    // it with /search).
    const origin = pathname === "/search" ? originPath : pathname;
    const params = new URLSearchParams({ q: term });
    if (origin && origin !== "/" && origin !== "/search") {
      params.set("from", origin);
    }
    router.push(`/search?${params.toString()}`);
  };

  const onClear = () => {
    setQ("");
    inputRef.current?.focus();
    // On the results page, emptying the field also clears the active filter: return to the
    // page the search came from (the home hero by default). Elsewhere there's no filter to
    // clear, so just empty the input.
    if (pathname === "/search") router.push(originPath || "/");
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
      {/* type="text" (not "search") so the browser's inconsistent native clear "x" doesn't
          double up with our own — ours also resets the filter, the native one wouldn't. */}
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="¿Qué buscás? Ej: Panadería, Clases de Inglés"
        aria-label="¿Qué buscás?"
        className="min-w-0 flex-1 bg-transparent py-3 text-base text-foreground outline-none placeholder:text-muted"
      />
      {/* Clear button: only while there's text. Clears the input (and, on the results page,
          the active filter). Kept out of the tab order's way as a plain icon button. */}
      {q && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar filtro"
          className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-black/5 hover:text-foreground"
        >
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      )}
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-brand-darker px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-darkest"
      >
        Buscar
      </button>
    </form>
  );
}
