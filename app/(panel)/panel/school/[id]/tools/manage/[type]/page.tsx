"use client";

/**
 * Per-kind tool management for a school (/panel/school/[id]/tools/manage/[type]).
 *
 * Reached from a kind card on the tools hub ("Administrar"). Lists every tool of ONE kind
 * (rifas, bingos, productos…) as a compact card grid (Activas / Ocultas), each card linking to
 * its edit page, and offers a "Crear <kind>" button that jumps to the creation form for this kind.
 * The hub stays a pure directory; this is where the board actually manages a kind's activities.
 * PURELY INFORMATIONAL — the platform never processes money.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ToolGridCard, TOOL_GRID } from "@/components/tools/ToolGridCard";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  TOOL_TYPE_LIST,
  createToolTitle,
  toolTypeMeta,
} from "@/lib/tools/registry";
import { getSchoolById, getToolsBySchool } from "@/lib/firestore";
import { type SchoolDoc, type ToolDoc, type ToolType } from "@/types";

/** Lifecycle of the school + tools fetch the page depends on. */
type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando herramientas…";

/**
 * Page heading, rendered identically in every state so the title never shifts. The title (the
 * kind's plural label) is known from the URL immediately, so it's stable even while loading; the
 * subtitle takes the school name once it loads. The back link returns to the tools hub — the tools
 * home — not the public profile, since this page is a child of the hub.
 */
function Heading({
  schoolId,
  title,
  subtitle,
}: {
  schoolId: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <>
      <p className="text-sm">
        <BackLink href={`/panel/school/${schoolId}/tools`}>
          Volver a herramientas
        </BackLink>
      </p>
      <header className="mt-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      </header>
    </>
  );
}

export default function SchoolToolKindPage() {
  const { id, type } = useParams<{ id: string; type: string }>();

  // A bogus kind in the URL (/tools/manage/foo) is a real 404 — validated before any other hook so
  // the page never fetches for a non-existent kind. The kind is fixed by the URL (stable per mount),
  // so the early return is consistent across renders.
  const meta = TOOL_TYPE_LIST.find((t) => t.key === type);
  if (!meta) notFound();
  const kind = meta.key;

  return <ToolKindContent schoolId={id} kind={kind} title={meta.pluralLabel} />;
}

function ToolKindContent({
  schoolId,
  kind,
  title,
}: {
  schoolId: string;
  kind: ToolType;
  title: string;
}) {
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tools, setTools] = useState<ToolDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const load = useCallback(() => {
    Promise.all([getSchoolById(schoolId), getToolsBySchool(schoolId)])
      .then(([s, t]) => {
        setSchool(s);
        setTools(t);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [schoolId]);

  useEffect(load, [load]);

  // Only this kind's tools. Bucket by toolTypeMeta(...).key so the "Otro" page also catches any
  // legacy/unknown stored type (which falls back to "other") — matching the hub's count.
  const kindTools = useMemo(
    () => tools.filter((t) => toolTypeMeta(t.type).key === kind),
    [tools, kind],
  );
  const activeTools = useMemo(
    () => kindTools.filter((t) => t.status === "active"),
    [kindTools],
  );
  const hiddenTools = useMemo(
    () => kindTools.filter((t) => t.status !== "active"),
    [kindTools],
  );

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading schoolId={schoolId} title={title} />
        <ul className={`mt-8 ${TOOL_GRID}`} aria-hidden="true">
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <li
              key={k}
              className="aspect-video animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
            />
          ))}
        </ul>
        <p className="sr-only" role="status">
          {LOADING_TEXT}
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading schoolId={schoolId} title={title} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar las herramientas. Revisá tu conexión e intentá de
          nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <main>
        <Heading schoolId={schoolId} title={title} />
        <p className="mt-4 text-sm text-muted">Escuela no encontrada.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return (
      <main>
        <Heading schoolId={schoolId} title={title} subtitle={school.name} />
        <p className="mt-4 text-sm text-muted">No administrás esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const Icon = toolTypeMeta(kind).icon;
  const createLabel = createToolTitle(kind);
  const createHref = `/panel/school/${schoolId}/tools/new?type=${kind}`;

  return (
    <main>
      <Heading schoolId={schoolId} title={title} subtitle={school.name} />

      <div className="mt-6">
        <Link href={createHref} className="btn btn-primary">
          {createLabel}
        </Link>
      </div>

      {/* Bingo only: its cartones live in reusable decks (mazos), shared across the school's
          bingos. Surfaced here (the bingo home) rather than on the hub. */}
      {kind === "bingo" && (
        <p className="mt-4 text-sm">
          <Link
            href={`/panel/school/${schoolId}/bingo-decks`}
            className="font-medium text-brand-darker hover:underline"
          >
            Mazos de bingo →
          </Link>
          <span className="ml-2 text-muted">
            Lotes de cartones reutilizables para tus bingos.
          </span>
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Activas ({activeTools.length})
        </h2>
        {kindTools.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Icon className="h-7 w-7" />}
              title={`Todavía no tenés ${title.toLowerCase()}`}
              description={`Creá la primera con el botón “${createLabel}”.`}
            />
          </div>
        ) : activeTools.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No hay ninguna activa: todas están ocultas.
          </p>
        ) : (
          <ul className={`mt-4 ${TOOL_GRID}`}>
            {activeTools.map((t) => (
              <ToolGridCard key={t.id} schoolId={schoolId} tool={t} />
            ))}
          </ul>
        )}
      </section>

      {hiddenTools.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Ocultas
          </h2>
          <ul className={`mt-4 ${TOOL_GRID}`}>
            {hiddenTools.map((t) => (
              <ToolGridCard key={t.id} schoolId={schoolId} tool={t} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
