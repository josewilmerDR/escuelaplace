"use client";

/**
 * Admin verification queue (/panel/admin).
 *
 * Schools are self-administered but start unverified: their payment methods stay hidden
 * and a banner shows until an admin approves them here. This screen lists every school
 * awaiting a decision (`pending` or `needs_reverification`), surfaces the data the admin
 * needs to vet — name, location, board contact, and the private payment methods — and lets
 * them approve it. Approving sets verificationStatus to 'verified' (admin-only by rules),
 * which reveals the payment methods to supporters and clears the banner. Because that makes
 * private data public and is awkward to undo, the approve action asks for confirmation with
 * the concrete impact (how many payment methods go public, or that none exist).
 *
 * Access is admin-only: the panel layout's <RequireAuth> only gates sign-in, so this page
 * checks `role === 'admin'` itself (and firestore.rules reject the write regardless).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { VerificationBadge } from "@/components/school/VerificationBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageTitle } from "@/components/ui/PageTitle";
import { VerifiedIcon } from "@/components/ui/icons";
import {
  auditCollusionFlag,
  auditEventLabel,
  formatAuditWhen,
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

/**
 * The page heading, rendered identically in every state (skeleton, empty, loaded) so
 * navigating here paints the title in its final position and size — only the content below
 * it changes. No layout shift ("parpadeo") during the Firestore read.
 */
function PageHeading() {
  return (
    <PageTitle
      title="Verificación de escuelas"
      subtitle="Revisa los datos de cada escuela y aprueba las que correspondan. Al verificar, sus métodos de pago quedan visibles para quienes quieran apoyarla."
    />
  );
}

/**
 * Loading shell. Renders the SAME heading + a couple of card placeholders the loaded list
 * does, so navigating here paints the heading instantly in its final position and only the
 * cards fade in. Used by BOTH the auth-loading state and the `items === null` queue-loading
 * state so the two are identical.
 */
function AdminPageSkeleton() {
  return (
    <main>
      <PageHeading />
      <ul className="mt-6 flex flex-col gap-4" aria-hidden="true">
        <li className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <li className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </ul>
      <p className="sr-only" role="status">
        Cargando cola de verificación…
      </p>
    </main>
  );
}

export default function AdminVerificationPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventDoc[] | null>(null);
  // One id per approval in flight, so verifying one school doesn't lock the rest of the queue.
  const [busyIds, setBusyIds] = useState<string[]>([]);
  // Queue-load failure (top of page) vs a per-school approve failure (shown on its own card).
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(
    null,
  );
  // Announced to screen readers after a successful approval (the card silently vanishes).
  const [notice, setNotice] = useState<string | null>(null);

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

  // Revalidate on return to the tab: another admin (or this admin elsewhere) may have
  // verified a school, so refresh the queue + audit trail in the background. A failed
  // background refresh keeps what's already on screen (no error flash).
  useEffect(() => {
    if (!isAdmin) return;
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      fetchQueue()
        .then(setItems)
        .catch(() => {});
      getRecentAuditEvents(50)
        .then(setAuditEvents)
        .catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [isAdmin, fetchQueue]);

  if (loading) return <AdminPageSkeleton />;

  if (!isAdmin) {
    return (
      <main>
        <PageTitle title="Verificación de escuelas" />
        <p role="alert" className="mt-2 text-error">
          No tienes acceso a esta sección.
        </p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const approve = async (id: string) => {
    setBusyIds((prev) => [...prev, id]);
    setActionError(null);
    try {
      await verifySchool(id);
      // Drop the approved school from the queue without a full reload.
      setItems((prev) => prev?.filter((it) => it.school.id !== id) ?? null);
      setNotice("Escuela verificada. Sus métodos de pago ya son visibles para el público.");
    } catch {
      setActionError({ id, message: "No se pudo verificar la escuela." });
    } finally {
      setBusyIds((prev) => prev.filter((x) => x !== id));
    }
  };

  return (
    <main>
      <PageHeading />

      {/* Polite live region: the approved card vanishes silently otherwise. */}
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}

      {items === null ? (
        <AdminPageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<VerifiedIcon className="h-7 w-7" />}
          title="No hay escuelas pendientes"
          description="Ya revisaste toda la cola: cuando una escuela nueva pida verificación, aparecerá acá."
        />
      ) : (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Escuelas pendientes ({items.length})
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {items.map(({ school, paymentMethods }) => (
              <SchoolReviewCard
                key={school.id}
                school={school}
                paymentMethods={paymentMethods}
                busy={busyIds.includes(school.id)}
                error={actionError?.id === school.id ? actionError.message : null}
                onApprove={() => approve(school.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <AuditSection events={auditEvents} />

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}

/**
 * Recent confirmation audit trail. Each row surfaces WHO confirmed support for WHOM and
 * highlights the collusion signals: a red row + "Autoconfirmación" when the confirming admin
 * also runs the supporter side, amber + "Auto-trato" when they merely share an administrator.
 * COUNTS and relationships only — never proof or money. The future risk-scoring layer consumes
 * the same `auditEvents` stream.
 */
function AuditSection({ events }: { events: AuditEventDoc[] | null }) {
  const flagged = events?.filter((e) => auditCollusionFlag(e) !== null) ?? [];
  const flaggedCount = flagged.length;
  // A self-confirmation is the sharpest signal: surface the summary in red when any exist.
  const hasSevere = flagged.some((e) => auditCollusionFlag(e) === "self_confirm");

  return (
    <section className="mt-10">
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
            <span className={`font-medium ${hasSevere ? "text-error" : "text-warning"}`}>
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
        <span className="shrink-0 text-xs text-muted">{formatAuditWhen(ev)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {auditEventLabel(ev)}
        {ev.projectTitle ? ` · ${ev.projectTitle}` : ""}
      </p>
      {(flag || !ev.schoolVerified) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {flag === "self_confirm" && <Badge tone="danger">Autoconfirmación</Badge>}
          {flag === "self_deal" && <Badge tone="warning">Auto-trato</Badge>}
          {!ev.schoolVerified && <Badge tone="warning">Escuela sin verificar</Badge>}
        </div>
      )}
    </li>
  );
}

function SchoolReviewCard({
  school,
  paymentMethods,
  busy,
  error,
  onApprove,
}: {
  school: SchoolDoc;
  paymentMethods: PaymentMethod[];
  busy: boolean;
  /** Per-card approve failure, shown on the action shelf next to the button. */
  error: string | null;
  onApprove: () => void;
}) {
  const where = locationParts(school.location).join(", ");
  const contact = school.boardContact;
  const hasContact = Boolean(contact?.name || contact?.phone || contact?.email);

  // Verifying makes the private payment methods public and is awkward to undo, so confirm
  // the concrete impact first (see <ConfirmDialog> below) — and warn loudly when there's
  // nothing to publish.
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    // Elevated calm-depth card per queued school (ring + soft shadow, no hard border).
    <li className={cardClass("elevated")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {school.name}
          </h3>
          {where && <p className="text-sm text-muted">{where}</p>}
        </div>
        <VerificationBadge status={school.verificationStatus} />
      </div>

      {school.verificationStatus === "needs_reverification" && (
        <p className="mt-3 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          Ya estuvo verificada: editó un dato sensible (nombre o métodos de pago) y quedó
          pendiente de re-aprobación. Verifica el nombre y los métodos de pago antes de
          confirmar.
        </p>
      )}

      {school.description && (
        <p className="mt-3 text-sm text-muted">{school.description}</p>
      )}

      {hasContact ? (
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
              {/* Full address must stay readable — it's the admin's identity check. */}
              <dd className="break-all" title={contact.email}>
                {contact.email}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-warning">
          Sin contacto de junta cargado.
        </p>
      )}

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
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          className="btn btn-primary mr-1"
        >
          {busy ? "Verificando…" : "Verificar escuela"}
        </button>
        <Link
          href={`/school/${school.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          Ver página pública
          <span className="sr-only"> (abre en una pestaña nueva)</span>
        </Link>
        {error && (
          <p role="alert" className="ml-1 w-full text-sm text-error">
            {error}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Verificar escuela"
        confirmLabel="Verificar escuela"
        onConfirm={() => {
          setConfirmOpen(false);
          onApprove();
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        {paymentMethods.length === 0 ? (
          <>
            {school.name} no tiene métodos de pago cargados. Si la verificas igual,
            no habrá datos para que los donantes la apoyen. ¿Verificar de todas
            formas?
          </>
        ) : (
          <>
            Al verificar {school.name},{" "}
            {paymentMethods.length === 1
              ? "su método de pago quedará visible"
              : `sus ${paymentMethods.length} métodos de pago quedarán visibles`}{" "}
            para el público.
          </>
        )}
      </ConfirmDialog>
    </li>
  );
}
