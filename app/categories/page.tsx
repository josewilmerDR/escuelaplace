import type { Metadata } from "next";
import Link from "next/link";
import { getCategories } from "@/lib/firestore";
import type { CategoryDoc } from "@/types";

/**
 * Full category listing: /categories
 * Linked from the home page's single-line category row ("Todas las categorías").
 * Server component — rendered on the server for SEO. Unlike the home row, this
 * page shows every category (including empty ones): it is the exhaustive
 * directory, and /category/[id] already handles the empty state.
 */

// Same ISR window as the home page: businessCount changes at most every 5 minutes.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Todas las categorías",
};

export default async function CategoriesPage() {
  let categories: CategoryDoc[] = [];
  let loadFailed = false;
  try {
    categories = await getCategories();
  } catch {
    loadFailed = true;
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Todas las categorías
          </h1>
          <p className="mt-1 text-sm text-muted">
            Explorá el directorio por rubro y encontrá comercios de tu comunidad.
          </p>
        </header>

        {loadFailed ? (
          <p className="text-muted">
            No pudimos cargar las categorías. Recargá la página para intentarlo
            de nuevo.
          </p>
        ) : categories.length === 0 ? (
          <p className="text-muted">Todavía no hay categorías publicadas.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <li key={c.id}>
                {/* Calm-depth card led by an app-icon tile holding the category glyph;
                    the brand ring lights up on hover instead of a hard border swap. */}
                <Link
                  href={`/category/${c.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:ring-2 hover:ring-brand"
                >
                  <span
                    aria-hidden
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-2xl ring-1 ring-inset ring-brand-dark/10"
                  >
                    {c.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold tracking-tight text-foreground">
                      {c.name}
                    </span>
                    <span className="block text-sm text-muted">
                      {c.businessCount === 1
                        ? "1 comercio"
                        : `${c.businessCount} comercios`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
