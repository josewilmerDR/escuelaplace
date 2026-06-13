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
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-slate-900">
          Todas las categorías
        </h1>

        {loadFailed ? (
          <p className="text-muted">
            No pudimos cargar las categorías. Recargá la página para intentarlo
            de nuevo.
          </p>
        ) : categories.length === 0 ? (
          <p className="text-muted">Todavía no hay categorías publicadas.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/category/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4 hover:border-brand-dark"
                >
                  <span aria-hidden className="text-2xl">
                    {c.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">
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
