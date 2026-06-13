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
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BusinessStatusBadge } from "@/components/business/BusinessStatusBadge";
import { VerificationBadge } from "@/components/school/VerificationBadge";
import {
  getPagesByUser,
  removeManagedPage,
  type ResolvedPage,
} from "@/lib/firestore";

const LOADING_TEXT = "Cargando tus páginas…";

export default function PanelHome() {
  // useSearchParams needs a Suspense boundary to keep the route statically
  // prerenderable; the fallback mirrors the data-loading state below.
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">{LOADING_TEXT}</p>}>
      <PanelHomeInner />
    </Suspense>
  );
}

function PanelHomeInner() {
  const { user } = useAuth();
  const router = useRouter();
  const createdId = useSearchParams().get("created");
  const [pages, setPages] = useState<ResolvedPage[] | null>(null);
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
    getPagesByUser(user.id)
      .then((resolved) => {
        if (cancelled) return;
        setPages(resolved);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar tus páginas.");
      });
    // Flipping this on cleanup drops a stale result when the account switches
    // (or the component unmounts) before the read resolves.
    return () => {
      cancelled = true;
    };
  }, [user]);

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
        <h1 className="text-2xl font-bold">Mis páginas</h1>
        <p className="mt-2 text-gray-600">{error}</p>
        <button type="button" onClick={() => void load()} className="btn btn-outline mt-4">
          Reintentar
        </button>
      </main>
    );
  }

  if (pages === null) {
    return (
      <main>
        <h1 className="text-2xl font-bold">Mis páginas</h1>
        <p className="mt-4 text-sm text-gray-500">{LOADING_TEXT}</p>
      </main>
    );
  }

  if (pages.length === 0) {
    return (
      <main>
        <h1 className="text-2xl font-bold">Mis páginas</h1>
        <p className="mt-2 text-gray-600">Todavía no administrás ninguna página.</p>
        <Link href="/panel/new" className="btn btn-primary mt-4">
          Crear mi primera página
        </Link>
        <DonateCallout />
      </main>
    );
  }

  const createdPage = createdId
    ? pages.find((p) => p.doc?.id === createdId)
    : undefined;

  return (
    <main>
      <h1 className="text-2xl font-bold">Mis páginas ({pages.length})</h1>
      {createdPage?.doc && (
        <CreatedBanner
          page={createdPage}
          onDismiss={() => router.replace("/panel", { scroll: false })}
        />
      )}
      <ul className="mt-6 flex flex-col gap-3">
        {pages.map((page) => (
          <PageCard
            key={`${page.type}-${page.id}`}
            page={page}
            highlight={page.doc?.id === createdId}
            onRemove={() => {
              if (!user) return;
              void removeManagedPage(user.id, {
                type: page.type,
                id: page.id,
                role: page.role,
              })
                .then(() => load())
                .catch(() => setError("No se pudieron cargar tus páginas."));
            }}
          />
        ))}
      </ul>
      <DonateCallout />
    </main>
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
      className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
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
        className="-m-2 shrink-0 p-2 hover:underline"
      >
        ✕
      </button>
    </div>
  );
}

function DonateCallout() {
  return (
    <section className="mt-8 rounded-lg border border-dashed p-4">
      <h2 className="font-semibold">Apoyá como persona</h2>
      <p className="mt-1 text-sm text-gray-600">
        No necesitás una página para apoyar: doná directamente a una escuela
        y, si querés, aparecé en su muro de agradecimiento.
      </p>
      <Link
        href="/panel/donate"
        className="mt-3 inline-block text-sm underline"
      >
        Donar a una escuela
      </Link>
    </section>
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
  /** Removes this (stale) entry from the user's managedPages and reloads the list. */
  onRemove: () => void;
}) {
  if (!page.doc) {
    return (
      <li className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
        <p>
          Una {page.type === "business" ? "página de comercio" : "página de escuela"} que
          administrabas ya no existe.
        </p>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "¿Quitar esta página de tu lista? Ya no existe y no se puede recuperar desde acá.",
              )
            ) {
              onRemove();
            }
          }}
          className="btn btn-outline mt-3"
        >
          Quitar de mi lista
        </button>
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
      // Mirror FormError: scroll the just-created card into view, since arrayUnion
      // appends it last (below the fold) while the CreatedBanner sits at the top.
      ref={(el) => {
        if (highlight) el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }}
      className={`rounded-lg border p-4 ${
        highlight ? "border-brand ring-2 ring-brand" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
            {typeLabel}
            {page.role === "editor" && (
              <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted">
                Editor
              </span>
            )}
          </span>
          <h2 className="truncate font-semibold">{page.doc.name}</h2>
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
          <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            {page.doc.verificationStatus === "needs_reverification"
              ? "Editaste datos sensibles: la escuela quedó pendiente de re-verificación. Los métodos de pago están ocultos hasta que el equipo apruebe los cambios."
              : "Datos sin verificar. Los métodos de pago permanecen ocultos hasta que el equipo verifique la escuela."}
          </p>
        )}

      {!highlight && page.type === "business" && page.doc.status === "draft" && (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          Tu página está en borrador y no es visible al público. Completá el
          perfil y publicala desde “Editar página”.
        </p>
      )}

      {/* Primary action gets the button treatment; the rest stay as text links
          with their own tap spacing so the row isn't a flat wall of underlines. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/panel/${page.type}/${page.doc.id}/edit`} className="btn btn-outline">
          Editar página
        </Link>
        {/* A non-active business profile 404s (public reads filter by status), so the
            public link only renders when it actually resolves. */}
        {(page.type === "school" || page.doc.status === "active") && (
          <Link href={href} className="inline-block py-1 underline">
            Ver página pública
          </Link>
        )}
        {page.type === "business" && (
          <>
            <Link
              href={`/panel/business/${page.doc.id}/subscribe`}
              className="inline-block py-1 underline"
            >
              Apoyar una escuela
            </Link>
            {/* Drafts have no public traffic yet, so metrics would be empty. */}
            {page.doc.status === "active" && (
              <Link
                href={`/panel/business/${page.doc.id}/metrics`}
                className="inline-block py-1 underline"
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
              className="inline-block py-1 underline"
            >
              Proyectos
            </Link>
            <Link
              href={`/panel/school/${page.doc.id}/subscriptions`}
              className="inline-block py-1 underline"
            >
              Confirmar apoyos
            </Link>
            <Link
              href={`/panel/school/${page.doc.id}/project-contributions`}
              className="inline-block py-1 underline"
            >
              Aportes a proyectos
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
