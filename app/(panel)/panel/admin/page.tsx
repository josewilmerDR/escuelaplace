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
import { BackLink } from "@/components/ui/BackLink";
import { useAuth } from "@/components/auth/AuthProvider";
import { VerificationBadge } from "@/components/school/VerificationBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerifiedIcon } from "@/components/ui/icons";
import {
  auditCollusionFlag,
  getRecentAuditEvents,
  getSchoolPrivate,
  getSchoolsAwaitingVerification,
  paymentMethodsOf,
  verifySchool,
} from "@/lib/firestore";
import { locationParts } from "@/lib/location";
import type { AuditEventDoc, PaymentMethod, SchoolDoc } from "@/types";

/** A queued school plus the private payment methods the admin reviews before approving. */
interface ReviewItem {
  school: SchoolDoc;
  paymentMethods: PaymentMethod[];
}

export default function AdminVerificationPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventDoc[] | null>(null);
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

  // Recent confirmation audit trail (admin-only; the rules reject it for everyone else).
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getRecentAuditEvents(50)
      .then((evs) => {
        if (!cancelled) setAuditEvents(evs);
      })
      .catch(() => {
        if (!cancelled) setAuditEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (loading) return <p className="text-sm text-muted">Cargando…</p>;

  if (!isAdmin) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Verificación de escuelas
        </h1>
        <p className="mt-2 text-error">No tenés acceso a esta sección.</p>
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
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Verificación de escuelas
      </h1>
      <p className="mt-1 text-sm text-muted">
        Revisá los datos de cada escuela y aprobá las que correspondan. Al verificar, sus
        métodos de pago quedan visibles para quienes quieran apoyarla.
      </p>

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      {items === null ? (
        <p className="mt-6 text-sm text-muted">Cargando cola de verificación…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<VerifiedIcon className="h-7 w-7" />}
          title="No hay escuelas pendientes"
          description="Ya revisaste toda la cola: cuando una escuela nueva pida verificación, aparecerá acá."
        />
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

      <AuditSection events={auditEvents} />

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}

/** Friendly label for an audit event by kind. */
function eventLabel(ev: AuditEventDoc): string {
  if (ev.type === "project_contribution_confirmed") {
    return ev.contributionType === "in_kind"
      ? "Donación en especie a proyecto"
      : "Aporte a proyecto";
  }
  return ev.supporterType === "user" ? "Donación personal" : "Apoyo de comercio";
}

/** Confirmed-at (or recorded-at) of an event, in the CR locale. */
function formatWhen(ev: AuditEventDoc): string {
  const d = (ev.confirmedAt ?? ev.createdAt)?.toDate?.();
  return d
    ? d.toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" })
    : "—";
}

/**
 * Recent confirmation audit trail. Each row surfaces WHO confirmed support for WHOM and
 * highlights the collusion signals: a red row + "Autoconfirmación" when the confirming admin
 * also runs the supporter side, amber + "Auto-trato" when they merely share an administrator.
 * COUNTS and relationships only — never proof or money. The future risk-scoring layer consumes
 * the same `auditEvents` stream.
 */
function AuditSection({ events }: { events: AuditEventDoc[] | null }) {
  const flaggedCount = events?.filter((e) => auditCollusionFlag(e) !== null).length ?? 0;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Auditoría de confirmaciones
      </h2>
      <p className="mt-1 text-sm text-muted">
        Rastro de las últimas confirmaciones para detectar patrones de fraude. Resaltamos los
        casos de auto-trato (la escuela y quien apoya comparten administrador) y
        autoconfirmación (la misma cuenta confirma su propio aporte).
        {flaggedCount > 0 && (
          <>
            {" "}
            <span className="font-medium text-warning">
              {flaggedCount === 1
                ? "1 caso marcado para revisar."
                : `${flaggedCount} casos marcados para revisar.`}
            </span>
          </>
        )}
      </p>

      {events === null ? (
        <p className="mt-4 text-sm text-muted">Cargando auditoría…</p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Todavía no hay confirmaciones registradas.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((ev) => (
            <AuditEventItem key={ev.id} ev={ev} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AuditEventItem({ ev }: { ev: AuditEventDoc }) {
  const flag = auditCollusionFlag(ev);
  // Highlight the row by severity: self-confirmation (red) outranks self-dealing (amber).
  const surface =
    flag === "self_confirm"
      ? "bg-error-tint ring-error/20"
      : flag === "self_deal"
        ? "bg-warning-tint ring-warning/20"
        : "bg-white ring-black/5";

  return (
    <li className={`rounded-xl p-4 text-sm shadow-sm ring-1 ${surface}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium text-foreground">
          {ev.supporterName || "—"}
          <span className="font-normal text-muted"> → </span>
          {ev.schoolName || ev.schoolId}
        </p>
        <span className="shrink-0 text-xs text-muted">{formatWhen(ev)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {eventLabel(ev)}
        {ev.projectTitle ? ` · ${ev.projectTitle}` : ""}
      </p>
      {(flag || !ev.schoolVerified) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {flag === "self_confirm" && (
            <span className="rounded-full bg-error px-2 py-0.5 text-xs font-medium text-white">
              Autoconfirmación
            </span>
          )}
          {flag === "self_deal" && (
            <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/15">
              Auto-trato
            </span>
          )}
          {!ev.schoolVerified && (
            <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/15">
              Escuela sin verificar
            </span>
          )}
        </div>
      )}
    </li>
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
    // Elevated calm-depth card per queued school (ring + soft shadow, no hard border).
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {school.name}
          </h2>
          {where && <p className="text-sm text-muted">{where}</p>}
        </div>
        <VerificationBadge status={school.verificationStatus} />
      </div>

      {school.verificationStatus === "needs_reverification" && (
        <p className="mt-3 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          Ya estuvo verificada: editó un dato sensible (nombre o métodos de pago) y quedó
          pendiente de re-aprobación. Revisá los cambios antes de confirmar.
        </p>
      )}

      {school.description && (
        <p className="mt-3 text-sm text-muted">{school.description}</p>
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
          <p className="mt-1 text-sm text-warning">
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

      {/* One solid primary approve action; the public-page link is a quiet chip. A thin
          divider sets the action shelf apart from the review details above. */}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-4 text-sm">
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="btn btn-primary mr-1"
        >
          {busy ? "Verificando…" : "Verificar escuela"}
        </button>
        <Link
          href={`/school/${school.id}`}
          target="_blank"
          className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          Ver página pública
        </Link>
      </div>
    </li>
  );
}
