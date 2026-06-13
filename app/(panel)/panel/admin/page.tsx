"use client";

/**
 * Admin verification queue (/panel/admin).
 *
 * Schools are self-administered but start unverified: their payment methods stay hidden
 * and a banner shows until an admin approves them here. This screen lists every school
 * awaiting a decision (`pending` or `needs_reverification`), surfaces the data the admin
 * needs to vet — name, location, board contact, and the private payment methods — and lets
 * them approve it. Approving sets verificationStatus to 'verified' (admin-only by rules),
 * which reveals the payment methods to supporters and clears the banner.
 *
 * Access is admin-only: the panel layout's <RequireAuth> only gates sign-in, so this page
 * checks `role === 'admin'` itself (and firestore.rules reject the write regardless).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { VerificationBadge } from "@/components/school/VerificationBadge";
import {
  getSchoolPrivate,
  getSchoolsAwaitingVerification,
  paymentMethodsOf,
  verifySchool,
} from "@/lib/firestore";
import { locationParts } from "@/lib/location";
import type { PaymentMethod, SchoolDoc } from "@/types";

/** A queued school plus the private payment methods the admin reviews before approving. */
interface ReviewItem {
  school: SchoolDoc;
  paymentMethods: PaymentMethod[];
}

export default function AdminVerificationPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  // Pull the queue, then each school's private payment data in parallel so the admin can
  // vet what they're about to make public. A failed private read shouldn't drop the school
  // from the queue, so it falls back to an empty list.
  const fetchQueue = useCallback(async (): Promise<ReviewItem[]> => {
    const schools = await getSchoolsAwaitingVerification();
    return Promise.all(
      schools.map(async (school) => {
        try {
          return {
            school,
            paymentMethods: paymentMethodsOf(await getSchoolPrivate(school.id)),
          };
        } catch {
          return { school, paymentMethods: [] };
        }
      }),
    );
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchQueue()
      .then((resolved) => {
        if (cancelled) return;
        setItems(resolved);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la cola de verificación.");
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, fetchQueue]);

  if (loading) return <p className="text-sm text-gray-500">Cargando…</p>;

  if (!isAdmin) {
    return (
      <main>
        <h1 className="text-2xl font-bold">Verificación de escuelas</h1>
        <p className="mt-2 text-red-600">No tenés acceso a esta sección.</p>
      </main>
    );
  }

  const approve = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await verifySchool(id);
      // Drop the approved school from the queue without a full reload.
      setItems((prev) => prev?.filter((it) => it.school.id !== id) ?? null);
    } catch {
      setError("No se pudo verificar la escuela.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="max-w-2xl">
      <h1 className="text-2xl font-bold">Verificación de escuelas</h1>
      <p className="mt-1 text-sm text-gray-600">
        Revisá los datos de cada escuela y aprobá las que correspondan. Al verificar, sus
        métodos de pago quedan visibles para quienes quieran apoyarla.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {items === null ? (
        <p className="mt-6 text-sm text-gray-500">Cargando cola de verificación…</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">
          No hay escuelas pendientes de verificación. 🎉
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {items.map(({ school, paymentMethods }) => (
            <SchoolReviewCard
              key={school.id}
              school={school}
              paymentMethods={paymentMethods}
              busy={busyId === school.id}
              disabled={busyId !== null}
              onApprove={() => approve(school.id)}
            />
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm">
        <Link href="/panel" className="underline">
          ← Volver al panel
        </Link>
      </p>
    </main>
  );
}

function SchoolReviewCard({
  school,
  paymentMethods,
  busy,
  disabled,
  onApprove,
}: {
  school: SchoolDoc;
  paymentMethods: PaymentMethod[];
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
}) {
  const where = locationParts(school.location).join(", ");
  const contact = school.boardContact;

  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{school.name}</h2>
          {where && <p className="text-sm text-muted">{where}</p>}
        </div>
        <VerificationBadge status={school.verificationStatus} />
      </div>

      {school.verificationStatus === "needs_reverification" && (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          Ya estuvo verificada: editó un dato sensible (nombre o métodos de pago) y quedó
          pendiente de re-aprobación. Revisá los cambios antes de confirmar.
        </p>
      )}

      {school.description && (
        <p className="mt-3 text-sm text-gray-700">{school.description}</p>
      )}

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {contact?.name && (
          <>
            <dt className="text-muted">Contacto</dt>
            <dd>{contact.name}</dd>
          </>
        )}
        {contact?.phone && (
          <>
            <dt className="text-muted">Teléfono</dt>
            <dd>{contact.phone}</dd>
          </>
        )}
        {contact?.email && (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="truncate">{contact.email}</dd>
          </>
        )}
      </dl>

      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Métodos de pago
        </p>
        {paymentMethods.length === 0 ? (
          <p className="mt-1 text-sm text-amber-700">
            Sin métodos de pago cargados. Al verificar no habrá datos para mostrar a los
            donantes.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {paymentMethods.map((m, i) => (
              <li key={`${m.label}-${i}`}>
                <span className="text-muted">{m.label}:</span> {m.value}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="btn btn-primary"
        >
          {busy ? "Verificando…" : "Verificar escuela"}
        </button>
        <Link
          href={`/school/${school.id}`}
          target="_blank"
          className="inline-block py-1 underline"
        >
          Ver página pública
        </Link>
      </div>
    </li>
  );
}
