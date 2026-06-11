"use client";

/**
 * Panel home (/panel): lists the pages (businesses/schools) the signed-in user
 * administers, via getPagesByUser. Schools show their verification state with an
 * "unverified data" banner while pending / needs_reverification.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPagesByUser, type ResolvedPage } from "@/lib/firestore";

export default function PanelHome() {
  const { user } = useAuth();
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
      </main>
    );
  }

  return (
    <main>
      <h1 className="text-2xl font-bold">Mis páginas</h1>
      <ul className="mt-6 flex flex-col gap-3">
        {pages.map((page) => (
          <PageCard key={`${page.type}-${page.doc?.id ?? "missing"}`} page={page} />
        ))}
      </ul>
    </main>
  );
}

function PageCard({ page }: { page: ResolvedPage }) {
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
    <li className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-wide text-gray-400">
            {typeLabel}
          </span>
          <h2 className="font-semibold">{page.doc.name}</h2>
        </div>
        {page.type === "school" && <VerificationBadge page={page} />}
      </div>

      {page.type === "school" && page.doc.verificationStatus !== "verified" && (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          {page.doc.verificationStatus === "needs_reverification"
            ? "Editaste datos sensibles: la escuela quedó pendiente de re-verificación. El SINPE está oculto hasta que el equipo apruebe los cambios."
            : "Datos sin verificar. El SINPE permanece oculto hasta que el equipo verifique la escuela."}
        </p>
      )}

      <div className="mt-3 flex gap-4 text-sm">
        <Link href={href} className="underline">
          Ver página pública
        </Link>
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
