"use client";

/**
 * Category management (/panel/admin/categories).
 *
 * The category taxonomy is curated, not user-generated: until this screen existed it was
 * frozen at whatever the seed wrote, editable only from the Firebase console. Here an admin
 * can create a rubro, rename it, change its emoji, reorder the list, and delete an empty one.
 *
 * `businessCount` is a function-maintained signal (onBusinessWritten) — shown read-only here;
 * a category that still has businesses can't be deleted (it would strand the denormalized
 * `categories[]` membership), so that action is gated on a zero count.
 *
 * Access is admin-only: the panel layout's <RequireAuth> only gates sign-in, so this page
 * checks `role === 'admin'` itself (and firestore.rules reject the writes regardless).
 */
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { PlusIcon, TagIcon } from "@/components/ui/icons";
import {
  createCategory,
  deleteCategory,
  getCategories,
  reorderCategories,
  updateCategory,
} from "@/lib/firestore";
import { pluralizeBusinesses } from "@/lib/format";
import type { CategoryDoc } from "@/types";

/**
 * Heading rendered identically in every state (skeleton, empty, loaded) so navigating here
 * paints the title in its final position — only the content below changes. No layout shift.
 */
function PageHeading() {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Categorías
      </h1>
      <p className="mt-1 text-sm text-muted">
        Creá, renombrá, reordená y borrá los rubros del directorio. El número de
        comercios de cada categoría se actualiza solo.
      </p>
    </header>
  );
}

function AdminCategoriesSkeleton() {
  return (
    <main>
      <PageHeading />
      <ul className="mt-6 flex flex-col gap-3" aria-hidden="true">
        <li className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <li className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <li className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </ul>
      <p className="sr-only" role="status">
        Cargando categorías…
      </p>
    </main>
  );
}

export default function AdminCategoriesPage() {
  const { user, loading } = useAuth();
  const [categories, setCategories] = useState<CategoryDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getCategories()
      .then((cats) => {
        if (cancelled) return;
        setCategories(cats);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar las categorías.");
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (loading) return <AdminCategoriesSkeleton />;

  if (!isAdmin) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Categorías
        </h1>
        <p role="alert" className="mt-2 text-error">
          No tenés acceso a esta sección.
        </p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const handleCreate = async (name: string, icon: string) => {
    // Append at the end: max existing order + 1 (orders aren't guaranteed contiguous).
    const nextOrder =
      (categories ?? []).reduce((max, c) => Math.max(max, c.order), -1) + 1;
    const id = await createCategory({ name, icon, order: nextOrder });
    setCategories((prev) => [
      ...(prev ?? []),
      { id, name, icon, order: nextOrder, businessCount: 0 },
    ]);
    setNotice(`Categoría "${name}" creada.`);
  };

  const handleUpdate = async (id: string, name: string, icon: string) => {
    await updateCategory(id, { name, icon });
    setCategories(
      (prev) =>
        prev?.map((c) => (c.id === id ? { ...c, name, icon } : c)) ?? null,
    );
    setNotice(`Categoría "${name}" actualizada.`);
  };

  const handleDelete = async (cat: CategoryDoc) => {
    await deleteCategory(cat.id);
    setCategories((prev) => prev?.filter((c) => c.id !== cat.id) ?? null);
    setNotice(`Categoría "${cat.name}" eliminada.`);
  };

  // Reorder by swapping with the neighbor, then persist the full sequence. Optimistic: the
  // list updates immediately and rolls back to the server order on failure.
  const handleMove = async (index: number, dir: -1 | 1) => {
    if (!categories) return;
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const previous = categories;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    try {
      await reorderCategories(next.map((c) => c.id));
    } catch {
      setCategories(previous);
      setError("No se pudo reordenar. Intentá de nuevo.");
    }
  };

  return (
    <main>
      <PageHeading />

      {/* Polite live region: create/update/delete/reorder mutate the list silently. */}
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}

      <NewCategoryForm
        onCreate={handleCreate}
        onError={(m) => setError(m)}
      />

      {categories === null ? (
        <AdminCategoriesSkeleton />
      ) : categories.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<TagIcon className="h-7 w-7" />}
          title="Todavía no hay categorías"
          description="Creá la primera con el formulario de arriba."
        />
      ) : (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Categorías ({categories.length})
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {categories.map((cat, i) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                isFirst={i === 0}
                isLast={i === categories.length - 1}
                onMoveUp={() => handleMove(i, -1)}
                onMoveDown={() => handleMove(i, 1)}
                onSave={(name, icon) => handleUpdate(cat.id, name, icon)}
                onDelete={() => handleDelete(cat)}
              />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}

function NewCategoryForm({
  onCreate,
  onError,
}: {
  onCreate: (name: string, icon: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedIcon = icon.trim();
    if (!trimmedName || !trimmedIcon) {
      onError("La categoría necesita un nombre y un emoji.");
      return;
    }
    setBusy(true);
    onError("");
    try {
      await onCreate(trimmedName, trimmedIcon);
      setName("");
      setIcon("");
    } catch {
      onError("No se pudo crear la categoría.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`mt-6 ${cardClass("inset")}`}>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Nueva categoría
      </h2>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="sm:w-24">
          <Field label="Emoji">
            <input
              className="input text-center"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              placeholder="🍔"
              aria-label="Emoji de la categoría"
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Nombre">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Restaurantes"
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary shrink-0"
        >
          <PlusIcon className="h-5 w-5" />
          {busy ? "Creando…" : "Crear"}
        </button>
      </div>
    </form>
  );
}

function CategoryRow({
  category,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
}: {
  category: CategoryDoc;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (name: string, icon: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const hasBusinesses = category.businessCount > 0;

  const save = async () => {
    const trimmedName = name.trim();
    const trimmedIcon = icon.trim();
    if (!trimmedName || !trimmedIcon) {
      setRowError("Necesita nombre y emoji.");
      return;
    }
    setBusy(true);
    setRowError(null);
    try {
      await onSave(trimmedName, trimmedIcon);
      setEditing(false);
    } catch {
      setRowError("No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setName(category.name);
    setIcon(category.icon);
    setRowError(null);
    setEditing(false);
  };

  // Deleting an empty category is reversible enough (re-create it); still confirm by name.
  const remove = async () => {
    if (!window.confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
    setBusy(true);
    setRowError(null);
    try {
      await onDelete();
    } catch {
      setRowError("No se pudo eliminar.");
      setBusy(false);
    }
  };

  return (
    <li className={cardClass("elevated")}>
      <div className="flex items-center gap-4">
        {/* Reorder controls: up/down chevrons (no up/down glyphs in icons.tsx, so inlined).
            Disabled at the ends of the list. */}
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst || busy}
            aria-label={`Subir ${category.name}`}
            className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
              <path d="M5 12l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast || busy}
            aria-label={`Bajar ${category.name}`}
            className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
              <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {editing ? (
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-20">
              <Field label="Emoji">
                <input
                  className="input text-center"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  maxLength={4}
                  aria-label={`Emoji de ${category.name}`}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Nombre">
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  aria-label={`Nombre de ${category.name}`}
                />
              </Field>
            </div>
          </div>
        ) : (
          <>
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-2xl text-brand-darker ring-1 ring-inset ring-brand-dark/10"
            >
              {category.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold tracking-tight text-foreground">
                {category.name}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {pluralizeBusinesses(category.businessCount)}
              </p>
            </div>
          </>
        )}

        {/* Actions shelf. One quiet edit chip + a destructive delete; while editing, the
            primary becomes Guardar. */}
        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="btn btn-primary"
              >
                {busy ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy || hasBusinesses}
                title={
                  hasBusinesses
                    ? "Reasigná sus comercios antes de borrarla"
                    : undefined
                }
                className="btn btn-destructive disabled:opacity-40"
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {hasBusinesses && !editing && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Badge tone="outline">{pluralizeBusinesses(category.businessCount)}</Badge>
          No se puede borrar mientras tenga comercios.
        </p>
      )}

      {rowError && (
        <p role="alert" className="mt-2 text-sm text-error">
          {rowError}
        </p>
      )}
    </li>
  );
}
