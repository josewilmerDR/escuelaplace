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
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPagesByUser, type ResolvedPage } from "@/lib/firestore";
import type { BusinessStatus } from "@/types";

export default function PanelHome() {
  // useSearchParams needs a Suspense boundary to keep the route statically
  // prerenderable; the fallback mirrors the data-loading state below.
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Cargando tus páginas…</p>}>
      <PanelHomeInner />
    </Suspense>
  );
}

function PanelHomeInner() {
  const { user } = useAuth();
  const router = useRouter();
  const createdId = useSearchParams().get("created");
  const [pages, setPages] = useState<ResolvedPage[] | null>(null);

  useEffect(() => {
    if (!user) return;
    getPagesByUser(user.id).then(setPages);
  }, [user]);

  if (pages === null) {
    return <p className="text-sm text-gray-500">Cargando tus páginas…</p>;
  }

  if (pages.length === 0) {
    return (
      <main>
        <h1 className="text-2xl font-bold">Mis páginas</h1>
        <p className="mt-2 text-gray-600">Todavía no administrás ninguna página.</p>
        <Link
          href="/panel/new"
          className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white"
        >
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
      <h1 className="text-2xl font-bold">Mis páginas</h1>
      {createdPage?.doc && (
        <CreatedBanner
          page={createdPage}
          onDismiss={() => router.replace("/panel", { scroll: false })}
        />
      )}
      <ul className="mt-6 flex flex-col gap-3">
        {pages.map((page) => (
          <PageCard
            key={`${page.type}-${page.doc?.id ?? "missing"}`}
            page={page}
            highlight={page.doc?.id === createdId}
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
          el equipo va a revisar los datos y mientras tanto el SINPE queda
          oculto.{" "}
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
        No necesitás una página para apoyar: doná directamente a la Junta de
        Educación de una escuela y, si querés, aparecé en su muro de
        agradecimiento.
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
}: {
  page: ResolvedPage;
  /** Visually singles out the just-created page (see CreatedBanner). */
  highlight?: boolean;
}) {
  if (!page.doc) {
    return (
      <li className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
        Una {page.type === "business" ? "página de comercio" : "página de escuela"} que
        administrabas ya no existe.
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
      className={`rounded-lg border p-4 ${
        highlight ? "border-brand ring-1 ring-brand" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-wide text-gray-400">
            {typeLabel}
          </span>
          <h2 className="font-semibold">{page.doc.name}</h2>
        </div>
        {page.type === "school" ? (
          <VerificationBadge page={page} />
        ) : (
          <BusinessStatusBadge status={page.doc.status} />
        )}
      </div>

      {page.type === "school" && page.doc.verificationStatus !== "verified" && (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          {page.doc.verificationStatus === "needs_reverification"
            ? "Editaste datos sensibles: la escuela quedó pendiente de re-verificación. El SINPE está oculto hasta que el equipo apruebe los cambios."
            : "Datos sin verificar. El SINPE permanece oculto hasta que el equipo verifique la escuela."}
        </p>
      )}

      {page.type === "business" && page.doc.status === "draft" && (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          Tu página está en borrador y no es visible al público. Completá el
          perfil y publicala desde “Editar página”.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {page.type === "business" && (
          <Link
            href={`/panel/business/${page.doc.id}/edit`}
            className="underline"
          >
            Editar página
          </Link>
        )}
        {/* A non-active business profile 404s (public reads filter by status), so the
            public link only renders when it actually resolves. */}
        {(page.type === "school" || page.doc.status === "active") && (
          <Link href={href} className="underline">
            Ver página pública
          </Link>
        )}
        {page.type === "business" && (
          <>
            <Link
              href={`/panel/business/${page.doc.id}/subscribe`}
              className="underline"
            >
              Apoyar una escuela
            </Link>
            <Link
              href={`/panel/business/${page.doc.id}/metrics`}
              className="underline"
            >
              Ver métricas
            </Link>
          </>
        )}
        {page.type === "school" && (
          <Link
            href={`/panel/school/${page.doc.id}/subscriptions`}
            className="underline"
          >
            Confirmar apoyos
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Publication status of a business page. `draft`/`active` are owner-controlled from the
 * edit page; `pending`/`suspended` are admin states.
 */
function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  const styles: Record<BusinessStatus, string> = {
    draft: "bg-gray-100 text-gray-700",
    pending: "bg-amber-100 text-amber-800",
    active: "bg-green-100 text-green-800",
    suspended: "bg-red-100 text-red-800",
  };
  const labels: Record<BusinessStatus, string> = {
    draft: "Borrador",
    pending: "En revisión",
    active: "Publicada",
    suspended: "Suspendida",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function VerificationBadge({
  page,
}: {
  page: Extract<ResolvedPage, { type: "school" }>;
}) {
  const status = page.doc?.verificationStatus;
  const styles: Record<string, string> = {
    verified: "bg-green-100 text-green-800",
    pending: "bg-amber-100 text-amber-800",
    needs_reverification: "bg-amber-100 text-amber-800",
  };
  const labels: Record<string, string> = {
    verified: "Verificada",
    pending: "Sin verificar",
    needs_reverification: "Re-verificación pendiente",
  };
  if (!status) return null;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
