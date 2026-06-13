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
    <form
      onSubmit={onSubmit}
      className="flex w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5"
    >
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="¿Qué buscás? Ej: Panadería, Clases de Inglés"
        aria-label="¿Qué buscás?"
        className="min-w-0 flex-1 px-5 py-4 text-base text-slate-800 outline-none placeholder:text-slate-400"
      />
      <button
        type="submit"
        className="shrink-0 bg-brand-darker px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-darkest"
      >
        Buscar
      </button>
    </form>
  );
}
