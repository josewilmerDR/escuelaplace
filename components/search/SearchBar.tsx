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
import { SearchIcon, XMarkIcon } from "@/components/ui/icons";

export function SearchBar({
  autoFocus = false,
  initialQuery = "",
  originPath = "",
  compact = false,
  flat = false,
}: {
  autoFocus?: boolean;
  initialQuery?: string;
  // Where the search was launched from, threaded through the /search?from=… param so that
  // clearing the filter returns the user to that page. Only the results page passes it
  // (read from the URL); on other surfaces the origin is the current pathname.
  originPath?: string;
  // Header variant: a small white pill sized to the brand band, instead of the tall hero
  // field. Same submit/clear logic — only the chrome differs.
  compact?: boolean;
  // Page-integrated elevation for the large field when it sits on the plain white body
  // (the /search results page) instead of lifting off a dark brand band: a soft hairline
  // ring + light shadow rather than the deep hero shadow. Ignored by the compact variant.
  flat?: boolean;
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

  // Compact header variant: a small white pill that sits on the dark brand band, sized to
  // the header's ghost chips (h-10). The leading magnifier doubles as the submit control
  // (Enter submits too via the form). focus-within lifts the ring so the field reads as one
  // focused unit.
  if (compact) {
    return (
      <form
        onSubmit={onSubmit}
        role="search"
        aria-label="Buscar comercios"
        className="flex h-10 w-full items-center gap-1 rounded-xl bg-white pl-2 pr-1.5 ring-1 ring-inset ring-black/5 transition focus-within:ring-2 focus-within:ring-white/70"
      >
        <button
          type="submit"
          aria-label="Buscar"
          className="shrink-0 rounded-md p-1 text-muted transition-colors hover:text-foreground"
        >
          <SearchIcon className="h-5 w-5" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Buscar comercios"
          aria-label="¿Qué buscás?"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        {q && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpiar"
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-black/5 hover:text-foreground"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </form>
    );
  }

  return (
    // Apple-style floating search field: a large, soft-shadowed white pill. The whole form
    // carries the focus ring (focus-within) so typing in the input lights up the field as one
    // unit, search button included. role="search" makes the form a landmark screen-reader
    // users can jump to.
    // Elevation adapts to the surface: over the dark brand band (home hero) it needs a deep
    // shadow to lift off; on the white results page (`flat`) a hairline ring + soft shadow
    // lets it read as part of the page instead of a separate hero card.
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="Buscar comercios"
      className={`flex w-full items-center gap-2 overflow-hidden rounded-2xl bg-white p-1.5 pl-5 transition focus-within:ring-2 focus-within:ring-brand ${
        flat ? "shadow-sm ring-1 ring-border" : "shadow-xl ring-1 ring-black/5"
      }`}
    >
      {/* Leading magnifier echoes the native search look; decorative (the field is labelled).
          Shared icon (same as the compact variant) so both search fields use one glyph. */}
      <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
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
          <XMarkIcon className="h-5 w-5" />
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
