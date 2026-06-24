"use client";

/**
 * Global activity roll-up (/panel/activity) — phase 2 of the unified inbox. A user who manages
 * more than one school confirms inside each school's own /activity inbox; this page is the
 * dispatcher above them: every managed school with its pending count, ordered most-pending first,
 * each linking into its inbox. The account nav's "Actividad" badge (ActivityNavLink) is the total
 * shown here. Pure overview — the confirming happens one tap away, in the per-school inbox, so the
 * cross-school logic isn't duplicated.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  ClockIcon,
} from "@/components/ui/icons";
import {
  getCachedPagesByUser,
  getPagesByUser,
  getPendingActivityCountBySchool,
  type ResolvedPage,
} from "@/lib/firestore";

type LoadState = "loading" | "error" | "loaded";

/** One managed school plus its pending-activity count. */
interface SchoolRow {
  id: string;
  name: string;
  count: number;
}

/** The schools (still existing) a user manages, as {id, name}. */
function managedSchools(pages: ResolvedPage[]): { id: string; name: string }[] {
  return pages
    .filter((p) => p.type === "school" && p.doc)
    .map((p) => ({ id: p.id, name: p.doc!.name }));
}

/** Resolve each school's pending count and sort most-pending first (then by name). */
async function loadRows(userId: string): Promise<SchoolRow[]> {
  const schools = managedSchools(await getPagesByUser(userId));
  const counts = await Promise.all(
    schools.map((s) => getPendingActivityCountBySchool(s.id)),
  );
  return schools
    .map((s, i) => ({ ...s, count: counts[i] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Actividad
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

export default function GlobalActivityPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SchoolRow[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // No synchronous setState here: the initial loadState is already "loading", so the mount
  // effect can call this directly without triggering a cascading render. The retry path (an event
  // handler, where setState is fine) flips back to "loading" before re-running it.
  const load = useCallback(() => {
    if (!user) return;
    loadRows(user.id)
      .then((r) => {
        setRows(r);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [user]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  // Quick presence check from the cache so a manager isn't shown the "no schools" copy on a
  // return visit while the counts resolve.
  const cachedHasSchools = useMemo(
    () =>
      user
        ? (getCachedPagesByUser(user.id) ?? []).some((p) => p.type === "school")
        : false,
    [user],
  );

  const total = rows?.reduce((sum, r) => sum + r.count, 0) ?? 0;

  if (loadState === "loading") {
    return (
      <main>
        <Heading />
        <ul className="mt-8 flex flex-col gap-3" aria-hidden="true">
          <li className="h-16 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-16 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </ul>
        <p className="sr-only" role="status">
          Cargando actividad…
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la actividad. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!rows || rows.length === 0) {
    // Only schools have a confirmation queue; if the user manages none, point them to creating
    // one (unless the cache says schools exist but a transient read returned empty).
    if (!cachedHasSchools) {
      return (
        <main>
          <Heading />
          <div className="mt-8">
            <EmptyState
              icon={<AcademicCapIcon className="h-7 w-7" />}
              title="No administras ninguna escuela"
              description="La actividad (apoyos, aportes y compras a confirmar) es de las escuelas. Crea la página de tu escuela para empezar."
              cta={{ label: "Crear página", href: "/panel/new" }}
            />
          </div>
        </main>
      );
    }
    return (
      <main>
        <Heading />
        <button type="button" onClick={retry} className="btn btn-outline mt-4">
          Reintentar
        </button>
      </main>
    );
  }

  return (
    <main>
      <Heading
        subtitle={
          total > 0
            ? `Tienes ${total} ${total === 1 ? "ítem pendiente" : "ítems pendientes"} de confirmar.`
            : "Estás al día en todas tus escuelas."
        }
      />

      {total === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<ClockIcon className="h-7 w-7" />}
            title="Nada pendiente"
            description="Cuando alguien apoye una de tus escuelas, aporte a un proyecto o compre en una herramienta, vas a verlo acá."
          />
        </div>
      ) : null}

      <ul className="mt-8 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/panel/school/${row.id}/activity`}
              className={`${cardClass("elevated")} flex items-center justify-between gap-3`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <AcademicCapIcon className="h-5 w-5 shrink-0 text-muted" />
                <span className="truncate font-semibold tracking-tight text-foreground">
                  {row.name}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {row.count > 0 ? (
                  <Badge tone="brand">
                    {row.count} {row.count === 1 ? "pendiente" : "pendientes"}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Al día</Badge>
                )}
                <ArrowRightIcon className="h-4 w-4 text-muted" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
