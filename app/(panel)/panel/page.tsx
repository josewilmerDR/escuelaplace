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
 * Visual treatment: each page is a full-bleed cover card (the same photo ladder the public
 * profile uses — cover → first gallery photo → logo/avatar — falling back to a brand
 * gradient + type glyph when the page has no image yet). The page type, role and
 * status/verification badge float over the top on frosted chips; the name sits over a bottom
 * scrim that keeps it legible on any photo. Schools: the whole card is a stretched link to the
 * public profile (where the SchoolManageBar carries the management actions), with the
 * verification badge top-left and an Actividad bell top-right raised above the link. Businesses:
 * a solid white "Editar" primary plus a glass "más" overflow menu, over the bottom scrim.
 * The cards lay out in a responsive grid (1
 * column on phones, up to 3 on wide screens) like the public catalog's card grids. All of
 * it composes the existing design tokens (--brand/--surface) — no new palette.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BusinessStatusBadge } from "@/components/business/BusinessStatusBadge";
import { VerificationBadge } from "@/components/school/VerificationBadge";
import { cardClass } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconTile } from "@/components/ui/IconTile";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  BellIcon,
  EllipsisIcon,
  HeartIcon,
  PagesIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  WarningIcon,
  XMarkIcon,
} from "@/components/ui/icons";
import {
  getCachedPagesByUser,
  getPagesByUser,
  getPendingActivityCountBySchool,
  removeManagedPage,
  type ResolvedPage,
} from "@/lib/firestore";

const LOADING_TEXT = "Cargando tus páginas…";

/**
 * The solid white primary action button, frosted so it integrates with the cover image instead
 * of sitting on it like a sticker. Only businesses use it now — for "Editar" (a draft 404s its
 * public link, so the public profile isn't a safe default), paired with a glass "más" overflow
 * menu for the secondary actions. Schools have no button row: the whole card is a stretched link
 * to the public profile, with just the Actividad bell raised above it.
 */
const PRIMARY_ACTION =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-brand-darker shadow-sm transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const GLASS_ICON_ACTION =
  "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-inset ring-white/30 backdrop-blur transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

/** A frosted pill that floats over the cover (page type, "Editor" role). */
const OVERLAY_CHIP =
  "inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/15 backdrop-blur";

/** A row inside the "más" overflow menu. */
const MENU_ITEM =
  "flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none";

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
      <ul
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-hidden="true"
      >
        <li className={`aspect-[3/2] animate-pulse ${cardClass("inset", false)}`} />
        <li className={`aspect-[3/2] animate-pulse ${cardClass("inset", false)}`} />
        <li className={`aspect-[3/2] animate-pulse ${cardClass("inset", false)}`} />
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
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

/** Page-type glyph (mortarboard for schools, tag for businesses), sized by `className`. */
function TypeGlyph({
  type,
  className,
}: {
  type: ResolvedPage["type"];
  className: string;
}) {
  return type === "school" ? (
    <AcademicCapIcon className={className} />
  ) : (
    <TagIcon className={className} />
  );
}

/**
 * The card's "más" control: a glass ellipsis button that opens a small menu of the
 * secondary actions (everything that isn't "Editar"). It lives OUTSIDE the cover's
 * overflow-hidden clip layer so the menu can extend past the card edge, and closes on an
 * outside click, on Escape, or once an item inside it is chosen.
 */
function MoreMenu({ note, children }: { note?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más opciones"
        className={GLASS_ICON_ACTION}
      >
        <EllipsisIcon className="h-5 w-5" />
      </button>
      {open && (
        // Opens upward (the trigger sits at the bottom of the card) and escapes the cover
        // clip; z-30 lifts it above neighbouring cards in the grid.
        <div
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-2 w-60 origin-bottom-right rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/10"
          // Any click that lands on an item (a Link) closes the menu before navigating.
          onClick={() => setOpen(false)}
        >
          {note && (
            <p className="mb-1 rounded-lg bg-warning-tint px-3 py-2 text-xs leading-snug text-warning">
              {note}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
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

  // Pending-activity badge for schools (the bell on the action row): supports, project aportes
  // and tool orders awaiting confirmation. Businesses have no such queue, so they skip the read.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (page.type !== "school" || !page.doc) return;
    let cancelled = false;
    getPendingActivityCountBySchool(page.doc.id)
      .then((count) => {
        if (!cancelled) setPendingCount(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page.type, page.doc]);

  // Removal is async (write + reload): track the in-flight window to block a double-submit
  // and surface a remove-specific failure inline on this card.
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // The confirm now lives in <ConfirmDialog> (confirmRemove); this does the work once
  // confirmed and closes the dialog on failure so the inline error is visible.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const handleRemove = () => {
    setBusy(true);
    setRemoveError(null);
    void onRemove()
      .catch(() => {
        setRemoveError("No se pudo quitar la página de tu lista. Intentá de nuevo.");
        setConfirmRemove(false);
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
          onClick={() => setConfirmRemove(true)}
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
        <ConfirmDialog
          open={confirmRemove}
          title="Quitar esta página de tu lista"
          confirmLabel="Quitar"
          tone="destructive"
          busy={busy}
          busyLabel="Quitando…"
          onConfirm={handleRemove}
          onCancel={() => setConfirmRemove(false)}
        >
          Ya no existe y no se puede recuperar desde acá.
        </ConfirmDialog>
      </li>
    );
  }

  const typeLabel = page.type === "business" ? "Comercio" : "Escuela";
  const href =
    page.type === "business"
      ? `/business/${page.doc.slug}`
      : `/school/${page.doc.id}`;

  // Cover hero, same ladder as the public profile: explicit cover → first gallery photo →
  // (schools) the avatar photo. A business with no photo but a logo shows the logo contained
  // on the gradient; with nothing at all both types fall back to a brand gradient + glyph.
  const photo =
    page.type === "business"
      ? page.doc.coverUrl ?? page.doc.photos?.[0]
      : page.doc.coverUrl ?? page.doc.photos?.[0] ?? page.doc.photoUrl;
  const logo = page.type === "business" ? page.doc.logoUrl : undefined;

  // Shown only inside the "más" menu (the at-a-glance signal is the status badge): the longer
  // sentence on why a draft / unverified page is limited. Suppressed when highlighted — the
  // CreatedBanner above already says it.
  const warning =
    highlight
      ? undefined
      : page.type === "school" && page.doc.verificationStatus !== "verified"
        ? page.doc.verificationStatus === "needs_reverification"
          ? "Editaste datos sensibles: la escuela quedó pendiente de re-verificación. Los métodos de pago siguen ocultos hasta una nueva aprobación del equipo."
          : "Datos sin verificar. Los métodos de pago permanecen ocultos hasta que el equipo verifique la escuela."
        : page.type === "business" && page.doc.status === "draft"
          ? "Esta página está en borrador y no es visible al público. Publicala desde “Editar”."
          : undefined;

  const coverSizes = "(min-width: 1280px) 300px, (min-width: 640px) 50vw, 100vw";

  return (
    <li
      ref={liRef}
      // Depth, not a hard border: a soft hairline ring + small shadow reads as an elevated
      // surface; the just-created card swaps the hairline for a brand ring + lift. NOT
      // overflow-hidden — the cover is clipped by its own layer so the "más" menu can spill
      // past the card edge.
      className={`group relative ${cardClass(highlight ? "selected" : "elevated", false)} transition-shadow`}
    >
      {/* Cover layer, clipped to the card radius and sitting under the content. */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes={coverSizes}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand to-brand-darker" />
        )}
        {!photo && logo && (
          // A logo stretched to fill looks broken — contain it on the gradient instead.
          <Image src={logo} alt="" fill sizes={coverSizes} className="object-contain p-10" />
        )}
        {!photo && !logo && (
          <div className="absolute inset-0 grid place-items-center">
            <TypeGlyph type={page.type} className="h-16 w-16 text-white/80" />
          </div>
        )}
        {/* Scrims keep the white chips (top) and name/buttons (bottom) legible over any photo. */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      </div>

      {/* Content layer: above the cover and NOT clipped, so the overflow menu can escape. The
          aspect ratio gives the card its height; justify-between pins the top row (chips +,
          for schools, the controls) to the top and the name (plus the business action row) to
          the bottom. */}
      <div className="relative flex aspect-[3/2] flex-col justify-between p-4">
        {/* Schools: the whole card is a link to the public profile (stretched-link pattern).
            It overlays the static content (chips, name) so a click anywhere opens the profile,
            while the interactive control — the Actividad bell — is raised above it (z-20) so it
            keeps its own behaviour. Nesting it as a real wrapping <a> would be invalid HTML. */}
        {page.type === "school" && (
          <Link
            href={href}
            aria-label={`Ver página de ${page.doc.name}`}
            className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
          />
        )}
        <div className="flex items-start justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={OVERLAY_CHIP}>
              <TypeGlyph type={page.type} className="h-3.5 w-3.5" />
              {typeLabel}
            </span>
            {page.role === "editor" && <span className={OVERLAY_CHIP}>Editor</span>}
            {/* Schools surface their verification badge here (top-left), so the top-right
                corner can host the controls and the name keeps the bottom to itself. */}
            {page.type === "school" && (
              <VerificationBadge status={page.doc.verificationStatus} />
            )}
          </span>
          {page.type === "school" ? (
            // The Actividad bell, raised above the card-wide stretched link (z-20) so it stays
            // its own target. There's no "Ver página" button anymore — the whole card is the
            // link to the public profile.
            <span className="relative z-20 flex shrink-0 items-center gap-2">
              <Link
                href={`/panel/school/${page.doc.id}/activity`}
                aria-label={
                  pendingCount > 0
                    ? `Actividad, ${pendingCount} pendientes`
                    : "Actividad"
                }
                className={`relative ${GLASS_ICON_ACTION}`}
              >
                <BellIcon className="h-5 w-5" />
                {pendingCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-darker px-1 text-xs font-semibold text-white ring-2 ring-white">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
            </span>
          ) : (
            <BusinessStatusBadge status={page.doc.status} />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="line-clamp-2 text-lg font-semibold tracking-tight text-white drop-shadow-sm">
            {page.doc.name}
          </h2>
          {/* Business action row: "Editar" primary + the glass "más" overflow menu. Schools
              moved their controls to the top-right, so for them the name owns the bottom. */}
          {page.type === "business" && (
            <div className="flex items-center justify-end gap-2">
              <Link
                href={`/panel/business/${page.doc.id}/edit`}
                className={PRIMARY_ACTION}
              >
                <PencilIcon className="h-4 w-4" />
                Editar
              </Link>
              <MoreMenu note={warning}>
                {/* A non-active business 404s its public link, so it renders only when active. */}
                {page.doc.status === "active" && (
                  <Link href={href} role="menuitem" className={MENU_ITEM}>
                    Ver página pública
                  </Link>
                )}
                <Link
                  href={`/panel/business/${page.doc.id}/subscribe`}
                  role="menuitem"
                  className={MENU_ITEM}
                >
                  Apoyar una escuela
                </Link>
                {/* Drafts have no public traffic yet, so metrics would be empty. */}
                {page.doc.status === "active" && (
                  <Link
                    href={`/panel/business/${page.doc.id}/metrics`}
                    role="menuitem"
                    className={MENU_ITEM}
                  >
                    Ver métricas
                  </Link>
                )}
              </MoreMenu>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
