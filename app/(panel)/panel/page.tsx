"use client";

/**
 * Panel home (/panel): lists the pages (businesses/schools) the signed-in user
 * administers, via getPagesByUser. Schools show their verification state with an
 * "unverified data" banner while pending / needs_reverification. Businesses show their
 * publication status: drafts are hidden from the public catalog (and their public URL
 * 404s) until published from the edit page, so the card only links to the public
 * profile when the page is active.
 *
 * Both creation forms route here with ?created=<id>: the matching card is highlighted
 * and a banner confirms the creation and says what to do next (publish the draft
 * business / wait for school verification). Dismissing it clears the param.
 *
 * Visual treatment follows the app's "calm, depth-not-borders" surface language: each
 * page is a soft elevated card (ring + shadow, no hard border) led by a rounded app-icon
 * tile, one solid primary action and the rest as quiet chip links. All of it composes the
 * existing design tokens (--brand/--surface) and .btn primitives — no new palette.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BusinessStatusBadge } from "@/components/business/BusinessStatusBadge";
import { VerificationBadge } from "@/components/school/VerificationBadge";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconTile } from "@/components/ui/IconTile";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  HeartIcon,
  PagesIcon,
  PlusIcon,
  TagIcon,
  WarningIcon,
  XMarkIcon,
} from "@/components/ui/icons";
import {
  getCachedPagesByUser,
  getPagesByUser,
  removeManagedPage,
  type ResolvedPage,
} from "@/lib/firestore";

const LOADING_TEXT = "Cargando tus páginas…";

/** Quiet, low-emphasis card action (everything except the lead "Editar página"). */
const CHIP_ACTION =
  "inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

export default function PanelHome() {
  // useSearchParams needs a Suspense boundary to keep the route statically
  // prerenderable; the fallback mirrors the data-loading state below.
  return (
    <Suspense fallback={<PanelHomeSkeleton />}>
      <PanelHomeInner />
    </Suspense>
  );
}

/**
 * The page heading, rendered identically in every state (skeleton, error, empty, loaded)
 * so navigating here paints the title in its final position and size — only the content
 * below it changes. The count and the top-right "Crear página" action appear only once the
 * list is known (count !== undefined), which adds nothing to the LEFT of the title, so the
 * title never shifts. The subtitle copy is constant for the same reason.
 */
function PanelHeading({ count }: { count?: number }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Mis páginas
          {count !== undefined && count > 0 && (
            <span className="ml-2 align-middle text-2xl font-normal text-muted">
              {count}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Administrá tus comercios y escuelas.
        </p>
      </div>
      {count !== undefined && count > 0 && (
        <Link
          href="/panel/new"
          className="btn btn-primary hidden shrink-0 gap-1.5 sm:inline-flex"
        >
          <PlusIcon className="h-4 w-4" />
          Crear página
        </Link>
      )}
    </header>
  );
}

/**
 * Loading shell. Renders the SAME heading + a couple of card placeholders the loaded list
 * does, so navigating here paints the heading instantly in its final position and only the
 * cards fade in — no blank flash ("parpadeo") during the Firestore read. Used by BOTH the
 * Suspense fallback and the in-component `pages === null` state so the two are identical.
 */
function PanelHomeSkeleton() {
  return (
    <main>
      <PanelHeading />
      <ul className="mt-8 flex flex-col gap-4" aria-hidden="true">
        <li className={`h-32 animate-pulse ${cardClass("inset", false)}`} />
        <li className={`h-32 animate-pulse ${cardClass("inset", false)}`} />
      </ul>
      <p className="sr-only" role="status">
        {LOADING_TEXT}
      </p>
    </main>
  );
}

function PanelHomeInner() {
  const { user } = useAuth();
  const router = useRouter();
  const createdId = useSearchParams().get("created");
  // Seed from the session cache so a return visit paints the known list instantly instead
  // of flashing the skeleton (stale-while-revalidate; the effect below refreshes it). Skip
  // the cache when arriving with ?created so the just-created page is guaranteed to show.
  const [pages, setPages] = useState<ResolvedPage[] | null>(() =>
    user && !createdId ? getCachedPagesByUser(user.id) : null,
  );
  const [error, setError] = useState<string | null>(null);

  // Single load entry point: used by the focus/visibility revalidation, the
  // "Reintentar" button and the stale-card removal. The mount effect inlines its
  // own version so it can own the account-switch cancellation.
  const load = useCallback(async (): Promise<void> => {
    if (!user) return;
    try {
      setPages(await getPagesByUser(user.id));
      setError(null);
    } catch {
      setError("No se pudieron cargar tus páginas.");
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    // Stale-while-revalidate: the cached list (if any) was already painted by the state
    // initializer on this return visit; here we just refresh it in the background. A failed
    // background refresh must not replace a list we're already showing — surface the error
    // only on a cold load (no cache).
    const hadCache = !createdId && getCachedPagesByUser(user.id) !== null;
    getPagesByUser(user.id)
      .then((resolved) => {
        if (cancelled) return;
        setPages(resolved);
        setError(null);
      })
      .catch(() => {
        if (!cancelled && !hadCache) setError("No se pudieron cargar tus páginas.");
      });
    // Flipping this on cleanup drops a stale result when the account switches
    // (or the component unmounts) before the read resolves.
    return () => {
      cancelled = true;
    };
  }, [user, createdId]);

  // Revalidate when the user returns to the panel, so status/verification badges
  // aren't stale after editing a page elsewhere (or in another tab).
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  if (error) {
    return (
      <main>
        <PanelHeading />
        <EmptyState
          icon={<WarningIcon className="h-7 w-7" />}
          title="No pudimos cargar tus páginas"
          description={error}
          cta={<RetryButton onRetry={load} />}
        />
      </main>
    );
  }

  if (pages === null) {
    return <PanelHomeSkeleton />;
  }

  if (pages.length === 0) {
    return (
      <main>
        <PanelHeading count={0} />
        <EmptyState
          icon={<PagesIcon className="h-7 w-7" />}
          title="Todavía no administrás ninguna página"
          description="Creá la página de tu comercio o de tu escuela para empezar a aparecer en el directorio de tu comunidad."
          cta={{ label: "Crear página", href: "/panel/new" }}
        />
        <DonateCallout />
      </main>
    );
  }

  const createdPage = createdId
    ? pages.find((p) => p.doc?.id === createdId)
    : undefined;

  return (
    <main>
      <PanelHeading count={pages.length} />
      {createdPage?.doc && (
        <CreatedBanner
          page={createdPage}
          onDismiss={() => router.replace("/panel", { scroll: false })}
        />
      )}
      <ul className="mt-8 flex flex-col gap-4">
        {pages.map((page) => (
          <PageCard
            key={`${page.type}-${page.id}`}
            page={page}
            highlight={page.doc?.id === createdId}
            // Resolves after the entry is removed and the list reloaded; rejects on a write
            // failure so the card can surface a remove-specific error inline (instead of
            // nuking the whole list with the page-level error screen).
            onRemove={async () => {
              if (!user) return;
              await removeManagedPage(user.id, {
                type: page.type,
                id: page.id,
                role: page.role,
              });
              await load();
            }}
          />
        ))}
      </ul>
      <DonateCallout />
    </main>
  );
}

/**
 * "Reintentar" action for the error state, with an in-flight disabled guard so a slow
 * retry can't be fired twice. `onRetry` clears the error on success (re-rendering this
 * away), so we only need to track the busy window here.
 */
function RetryButton({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setBusy(true);
        void onRetry().finally(() => setBusy(false));
      }}
      disabled={busy}
      className="btn btn-outline"
    >
      Reintentar
    </button>
  );
}

/**
 * Post-creation confirmation. Without it the user lands on the list with zero feedback
 * on what happened or what to do next — and a freshly created business is a draft, so
 * "where is my page?" needs an answer with the publish path in it.
 */
function CreatedBanner({
  page,
  onDismiss,
}: {
  page: ResolvedPage;
  onDismiss: () => void;
}) {
  if (!page.doc) return null;
  return (
    <div
      role="status"
      className="mt-6 flex items-start justify-between gap-3 rounded-2xl border border-success/15 bg-success-tint p-4 text-sm text-success"
    >
      {page.type === "business" ? (
        <p>
          <strong>¡Tu comercio se creó!</strong> Está en borrador y todavía no es
          visible al público.{" "}
          <Link
            href={`/panel/business/${page.doc.id}/edit`}
            className="font-medium underline"
          >
            Completá el perfil y publicalo
          </Link>
          .
        </p>
      ) : (
        <p>
          <strong>¡Tu escuela se creó!</strong> Se publica como “sin verificar”:
          el equipo va a revisar los datos y mientras tanto los métodos de pago
          quedan ocultos.{" "}
          <Link href={`/school/${page.doc.id}`} className="font-medium underline">
            Ver página pública
          </Link>
          .
        </p>
      )}
      {/* Inflated tap target (negative margin keeps the visual layout untouched). */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="-m-2 shrink-0 rounded-full p-2 transition-colors hover:bg-success/10"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function DonateCallout() {
  return (
    <section className={`mt-10 flex items-start gap-4 ${cardClass("inset")}`}>
      <IconTile size="md">
        <HeartIcon className="h-6 w-6" />
      </IconTile>
      <div className="min-w-0">
        <h2 className="font-semibold tracking-tight text-foreground">
          Apoyá como persona
        </h2>
        <p className="mt-1 text-sm text-muted">
          No necesitás una página para apoyar: doná directamente a una escuela
          y, si querés, aparecé en su muro de agradecimiento.
        </p>
        <Link
          href="/panel/donate"
          className="mt-3 inline-flex min-h-10 items-center gap-1 py-1 text-sm font-medium text-brand-darker transition-colors hover:text-brand-darkest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          Donar a una escuela
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

/**
 * App-icon style tile that leads each card: a rounded square in a soft brand wash with the
 * page-type glyph (mortarboard for schools, tag for businesses). The instant visual cue for
 * "is this a school or a comercio" before reading a word.
 */
function PageIconTile({ type }: { type: ResolvedPage["type"] }) {
  return (
    <IconTile size="md">
      {type === "school" ? (
        <AcademicCapIcon className="h-6 w-6" />
      ) : (
        <TagIcon className="h-6 w-6" />
      )}
    </IconTile>
  );
}

function PageCard({
  page,
  highlight = false,
  onRemove,
}: {
  page: ResolvedPage;
  /** Visually singles out the just-created page (see CreatedBanner). */
  highlight?: boolean;
  /**
   * Removes this (stale) entry from the user's managedPages and reloads the list. Resolves
   * on success; rejects on a write failure so the card can show an inline error instead of
   * collapsing the whole list.
   */
  onRemove: () => Promise<void>;
}) {
  // Scroll the just-created card into view exactly once. Inline refs run on every render, so
  // the focus/visibility revalidation used to re-scroll repeatedly; a guard ref pins it to
  // the first time this card is highlighted.
  const liRef = useRef<HTMLLIElement>(null);
  const scrolledForRef = useRef(false);
  useEffect(() => {
    if (highlight && !scrolledForRef.current && liRef.current) {
      scrolledForRef.current = true;
      // Mirror FormError: scroll the just-created card into view, since arrayUnion appends it
      // last (below the fold) while the CreatedBanner sits at the top.
      liRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlight]);

  // Removal is async (write + reload): track the in-flight window to block a double-submit
  // and surface a remove-specific failure inline on this card.
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const handleRemove = () => {
    if (
      !window.confirm(
        "¿Quitar esta página de tu lista? Ya no existe y no se puede recuperar desde acá.",
      )
    ) {
      return;
    }
    setBusy(true);
    setRemoveError(null);
    void onRemove()
      .catch(() => {
        setRemoveError("No se pudo quitar la página de tu lista. Intentá de nuevo.");
      })
      .finally(() => setBusy(false));
  };

  if (!page.doc) {
    return (
      <li className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
        <p>
          Una {page.type === "business" ? "página de comercio" : "página de escuela"} que
          administrabas ya no existe.
        </p>
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="btn btn-destructive mt-3"
        >
          Quitar de mi lista
        </button>
        {removeError && (
          <p className="mt-3 rounded-xl bg-error-tint p-3 text-xs text-error ring-1 ring-error/10">
            {removeError}
          </p>
        )}
      </li>
    );
  }

  const typeLabel = page.type === "business" ? "Comercio" : "Escuela";
  const href =
    page.type === "business"
      ? `/business/${page.doc.slug}`
      : `/school/${page.doc.id}`;

  return (
    <li
      ref={liRef}
      // Depth, not a hard border: a soft hairline ring + small shadow reads as an elevated
      // surface. The just-created card swaps the hairline for a brand ring + lift.
      className={`${cardClass(highlight ? "selected" : "elevated")} transition-shadow`}
    >
      <div className="flex items-center gap-4">
        <PageIconTile type={page.type} />
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
            {typeLabel}
            {page.role === "editor" && <Badge tone="outline">Editor</Badge>}
          </span>
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {page.doc.name}
          </h2>
        </div>
        {page.type === "school" ? (
          <VerificationBadge status={page.doc.verificationStatus} />
        ) : (
          <BusinessStatusBadge status={page.doc.status} />
        )}
      </div>

      {/* Hidden when highlighted: the CreatedBanner already states the same thing. */}
      {!highlight &&
        page.type === "school" &&
        page.doc.verificationStatus !== "verified" && (
          <p className="mt-4 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
            {page.doc.verificationStatus === "needs_reverification"
              ? "Editaste datos sensibles: la escuela quedó pendiente de re-verificación. Los métodos de pago están ocultos hasta que el equipo apruebe los cambios."
              : "Datos sin verificar. Los métodos de pago permanecen ocultos hasta que el equipo verifique la escuela."}
          </p>
        )}

      {!highlight && page.type === "business" && page.doc.status === "draft" && (
        <p className="mt-4 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          Tu página está en borrador y no es visible al público. Completá el
          perfil y publicala desde “Editar página”.
        </p>
      )}

      {/* One solid lead action; the rest are quiet chip links that light up on hover, so the
          row reads as a single primary + secondary shelf instead of a flat wall of links. A
          thin divider sets the action shelf apart from the card header. */}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-4 text-sm">
        <Link
          href={`/panel/${page.type}/${page.doc.id}/edit`}
          className="btn btn-primary mr-1"
        >
          Editar página
        </Link>
        {/* A non-active business profile 404s (public reads filter by status), so the
            public link only renders when it actually resolves. */}
        {(page.type === "school" || page.doc.status === "active") && (
          <Link href={href} className={CHIP_ACTION}>
            Ver página pública
          </Link>
        )}
        {page.type === "business" && (
          <>
            <Link
              href={`/panel/business/${page.doc.id}/subscribe`}
              className={CHIP_ACTION}
            >
              Apoyar una escuela
            </Link>
            {/* Drafts have no public traffic yet, so metrics would be empty. */}
            {page.doc.status === "active" && (
              <Link
                href={`/panel/business/${page.doc.id}/metrics`}
                className={CHIP_ACTION}
              >
                Ver métricas
              </Link>
            )}
          </>
        )}
        {page.type === "school" && (
          <>
            <Link
              href={`/panel/school/${page.doc.id}/projects`}
              className={CHIP_ACTION}
            >
              Proyectos
            </Link>
            <Link
              href={`/panel/school/${page.doc.id}/subscriptions`}
              className={CHIP_ACTION}
            >
              Confirmar apoyos
            </Link>
            <Link
              href={`/panel/school/${page.doc.id}/project-contributions`}
              className={CHIP_ACTION}
            >
              Aportes a proyectos
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
