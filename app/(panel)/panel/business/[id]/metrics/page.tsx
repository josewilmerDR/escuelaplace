"use client";

/**
 * Business funnel report (/panel/business/[id]/metrics).
 *
 * Reads the metricsDaily series (written by the trackInteraction function) for the
 * current and previous month in Costa Rica time, and renders the funnel the public
 * profile feeds: views → contact clicks per channel, plus cost-per-contact against the
 * business's active school support. These numbers are PRIVATE to the page's managers
 * and never feed the public ranking — and the WhatsApp count is auditable against the
 * owner's own chats, which is what makes the report credible.
 */
import { useCallback, useEffect, useState } from "react";
import { BusinessPanelNav } from "@/components/business/BusinessPanelNav";
import { BackLink } from "@/components/ui/BackLink";
import { Section } from "@/components/ui/Section";
import { PlusIcon } from "@/components/ui/icons";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getBusinessById,
  getBusinessDailyMetrics,
  getSubscriptionsByBusiness,
  isCountingSubscription,
  recordWalkIn,
} from "@/lib/firestore";
import { formatColones } from "@/lib/format";
import {
  crDayKey,
  monthLabel,
  monthRange,
  previousMonthRange,
  summarizeDailyMetrics,
  type MetricsSummary,
} from "@/lib/metrics";
import type { BusinessDoc, ContactChannel } from "@/types";

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: "Chats de WhatsApp",
  catalog: "Vistas del catálogo",
  phone: "Llamadas",
  directions: "Cómo llegar",
  website: "Sitio web",
  instagram: "Instagram",
  facebook: "Facebook",
};

/** Render order: decreasing intent, same as the profile buttons. */
const CHANNEL_ORDER: ContactChannel[] = [
  "whatsapp",
  "catalog",
  "phone",
  "directions",
  "website",
  "instagram",
  "facebook",
];

// One shared empty summary: byChannel is only ever read, never mutated, so a single
// module-level object is safe to reuse across renders.
const EMPTY: MetricsSummary = { views: 0, contacts: 0, walkIns: 0, byChannel: {} };

export default function BusinessMetricsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  // Month windows are fixed at mount; a session won't straddle a month change in any
  // way that matters for this report.
  const [ranges] = useState(() => {
    const today = crDayKey(Date.now());
    return {
      today,
      current: monthRange(today),
      previous: previousMonthRange(today),
    };
  });

  const [business, setBusiness] = useState<BusinessDoc | null>(null);
  const [current, setCurrent] = useState<MetricsSummary | null>(null);
  const [previous, setPrevious] = useState<MetricsSummary | null>(null);
  const [activeSupport, setActiveSupport] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);

  const [todayWalkIns, setTodayWalkIns] = useState(0);
  const [recording, setRecording] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);

  // Single load entry point: shared by the mount effect and the "Reintentar" button so a
  // transient failure isn't a dead end. Resets the loaded/denied flags before re-running.
  // Depends on the granular range fields (not the `ranges` object) so the React compiler
  // can preserve the memoization.
  const { from: curFrom, to: curTo } = ranges.current;
  const { from: prevFrom, to: prevTo } = ranges.previous;
  const today = ranges.today;
  const load = useCallback(() => {
    setLoaded(false);
    setDenied(false);
    Promise.all([
      getBusinessById(id),
      getBusinessDailyMetrics(id, curFrom, curTo),
      getBusinessDailyMetrics(id, prevFrom, prevTo),
      getSubscriptionsByBusiness(id),
    ])
      .then(([b, currentDays, previousDays, subs]) => {
        setBusiness(b);
        setCurrent(summarizeDailyMetrics(currentDays));
        setPrevious(summarizeDailyMetrics(previousDays));
        setTodayWalkIns(currentDays.find((d) => d.day === today)?.walkIns ?? 0);
        setActiveSupport(
          subs
            .filter((s) => isCountingSubscription(s))
            .reduce((acc, s) => acc + s.amount, 0),
        );
      })
      // The metricsDaily reads are owner/editor/admin-only by rules, so a denied
      // promise here almost always means "not a manager of this business".
      .catch(() => setDenied(true))
      .finally(() => setLoaded(true));
  }, [id, curFrom, curTo, prevFrom, prevTo, today]);

  useEffect(() => {
    // Kick off the load on mount / when its inputs change. Scheduled off the effect body
    // (not called synchronously) so it doesn't cascade renders within the effect.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const onWalkIn = async (delta: 1 | -1) => {
    setRecording(true);
    setWalkInError(null);
    // Capture today's pre-call value so we can patch the month total by the delta the
    // server ACTUALLY applied — recordWalkIn clamps at 0, so a decrement may move today by
    // less than `delta`. Deriving the month from (server today − previous today) keeps the
    // two counters in sync even when the server clamps.
    const prevToday = todayWalkIns;
    try {
      const result = await recordWalkIn(id, delta);
      setTodayWalkIns(result.walkIns);
      // Today always belongs to the current month window (both fixed at mount).
      setCurrent((c) =>
        c
          ? { ...c, walkIns: Math.max(0, c.walkIns + (result.walkIns - prevToday)) }
          : c,
      );
    } catch {
      setWalkInError("No se pudo registrar. Probá de nuevo.");
    } finally {
      setRecording(false);
    }
  };

  if (!loaded) return <MetricsSkeleton businessName={business?.name} />;

  const isManager =
    user != null &&
    business != null &&
    (business.ownerId === user.id ||
      business.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (denied || !business || !isManager) {
    // Permission-denied and a plain network failure are indistinguishable from here, so
    // the copy stays hedged. Keep the heading and a way out (Volver al panel), and offer a
    // retry — a transient read failure shouldn't trap a real manager on a dead page.
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Métricas
        </h1>
        <p className="mt-6 text-sm text-error">
          No administrás este comercio o no se pudieron cargar sus métricas.
        </p>
        <button type="button" onClick={load} className="btn btn-outline mt-4">
          Reintentar
        </button>
        <p className="mt-8 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const cur = current ?? EMPTY;
  const prev = previous ?? EMPTY;
  const hasActivity =
    cur.views + cur.contacts + cur.walkIns + prev.views + prev.contacts + prev.walkIns >
    0;
  const costPerContact =
    activeSupport > 0 && cur.contacts > 0 ? activeSupport / cur.contacts : null;

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Métricas
      </h1>
      <p className="mt-1 text-sm text-muted">{business.name}</p>

      <BusinessPanelNav
        businessId={id}
        active={business.status === "active"}
        current="metrics"
      />

      {!process.env.NEXT_PUBLIC_TRACK_INTERACTION_URL && (
        <p className="mt-4 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          El conteo de eventos no está configurado en este entorno
          (NEXT_PUBLIC_TRACK_INTERACTION_URL), así que las visitas nuevas no se están
          registrando.
        </p>
      )}

      <Section
        title="Clientes de escuelaplace"
        description="Tocá el botón cada vez que un cliente mencione escuelaplace en el local — por ejemplo, al pedir el descuento."
      >
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => onWalkIn(1)}
            disabled={recording}
            aria-busy={recording}
            className="btn btn-primary"
          >
            {recording ? (
              "Registrando…"
            ) : (
              <>
                <PlusIcon className="mr-1.5 h-4 w-4" />Cliente de escuelaplace
              </>
            )}
          </button>
          {/* Announce the updated counts (and the appearing "Deshacer") to screen readers. */}
          <span className="text-sm text-muted" aria-live="polite">
            Hoy:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {todayWalkIns}
            </span>{" "}
            · Este mes:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {cur.walkIns}
            </span>
            {todayWalkIns > 0 && (
              // Inflated tap target (≥40px) without moving the visual layout: negative
              // margin absorbs the padding so it still reads as a small inline text link.
              <button
                type="button"
                onClick={() => onWalkIn(-1)}
                disabled={recording}
                className="ml-3 inline-flex min-h-10 items-center text-xs underline hover:text-brand-darker"
              >
                Deshacer
              </button>
            )}
          </span>
        </div>

        {walkInError && (
          <p className="mt-2 text-sm text-error">{walkInError}</p>
        )}

        <p className="mt-3 text-xs text-muted">
          Contar de más no te da nada — esta métrica no afecta tu posición ni el ranking —
          y contar de menos solo empobrece la exactitud de tu propio reporte.
        </p>
      </Section>

      <Section
        title={monthLabel(ranges.current.month)}
        action={
          <span className="text-xs text-muted">
            vs. {monthLabel(ranges.previous.month)}
          </span>
        }
      >
        {!hasActivity ? (
          <p className="mt-4 text-sm text-muted">
            {process.env.NEXT_PUBLIC_TRACK_INTERACTION_URL
              ? "Aún no hay actividad registrada. Los contadores empiezan a moverse cuando la gente visita tu perfil público y usa los botones de contacto."
              : "El conteo de eventos no está configurado en este entorno, así que las visitas y contactos no se registran. Tu conteo de clientes en el local sí funciona."}
          </p>
        ) : (
          <dl className="mt-4 flex flex-col">
            <MetricRow
              label="Vistas del perfil"
              value={cur.views}
              prevValue={prev.views}
            />
            {CHANNEL_ORDER.filter(
              (c) => (cur.byChannel[c] ?? 0) + (prev.byChannel[c] ?? 0) > 0,
            ).map((c) => (
              <MetricRow
                key={c}
                label={CHANNEL_LABELS[c]}
                value={cur.byChannel[c] ?? 0}
                prevValue={prev.byChannel[c] ?? 0}
              />
            ))}
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <dt className="text-sm font-semibold">Contactos totales</dt>
              <dd className="flex items-baseline gap-3">
                <span className="tabular-nums font-semibold">{cur.contacts}</span>
                <Delta value={cur.contacts} prevValue={prev.contacts} />
              </dd>
            </div>
            <MetricRow
              label="Clientes en el local (tu conteo)"
              value={cur.walkIns}
              prevValue={prev.walkIns}
            />
          </dl>
        )}

        {costPerContact !== null ? (
          <p className="mt-4 rounded-xl bg-brand-tint p-3 text-sm text-brand-darker ring-1 ring-brand-dark/10">
            Tu apoyo activo a escuelas es {formatColones(activeSupport)} →{" "}
            <span className="font-semibold">
              ≈ {formatColones(Math.round(costPerContact))} por contacto
            </span>{" "}
            (apoyo activo ÷ contactos del mes).
          </p>
        ) : (
          // Supporting a school but no contacts yet: explain the empty cost figure instead
          // of silently hiding the note (which reads as "nothing to support here").
          activeSupport > 0 &&
          cur.contacts === 0 && (
            <p className="mt-4 rounded-xl bg-surface p-3 text-sm text-muted ring-1 ring-black/5">
              Aún sin contactos este mes para calcular el costo por contacto.
            </p>
          )
        )}
      </Section>

      <p className="mt-4 text-xs text-muted">
        Estas métricas son privadas: solo las ven quienes administran esta página y no
        afectan tu posición en el catálogo. El conteo de chats lo podés verificar en tu
        propio WhatsApp — cada conversación que llega desde tu perfil empieza
        mencionando escuelaplace.
      </p>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}

/** One funnel line: label, this month's count, and the change vs the previous month. */
function MetricRow({
  label,
  value,
  prevValue,
}: {
  label: string;
  value: number;
  prevValue: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-baseline gap-3">
        <span className="tabular-nums font-medium">{value}</span>
        <Delta value={value} prevValue={prevValue} />
      </dd>
    </div>
  );
}

function Delta({ value, prevValue }: { value: number; prevValue: number }) {
  // No baseline → no percentage worth showing (∞% reads as a bug, not an insight).
  // "nuevo" is already plain readable text, so it needs no extra sr-only label.
  if (prevValue === 0) {
    return <span className="w-14 text-right text-xs text-muted">nuevo</span>;
  }
  const pct = Math.round(((value - prevValue) / prevValue) * 100);
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "=";
  // The ▲▼= glyphs read literally to a screen reader, so hide them and pair a spoken label.
  const label =
    pct > 0 ? `subió ${pct}%` : pct < 0 ? `bajó ${Math.abs(pct)}%` : "sin cambios";
  return (
    <span className="w-14 text-right text-xs tabular-nums text-muted">
      <span aria-hidden="true">
        {arrow}
        {pct !== 0 && ` ${Math.abs(pct)}%`}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Loading shell. Paints the same `<h1>Métricas</h1>` in its final position (plus the
 * business-name subtitle once it's known) so navigating here doesn't shift the title when
 * the data resolves; the two section bodies are placeholder blocks that fade in. Mirrors
 * PanelHomeSkeleton in panel/page.tsx.
 */
function MetricsSkeleton({ businessName }: { businessName?: string }) {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Métricas
      </h1>
      {businessName && <p className="mt-1 text-sm text-muted">{businessName}</p>}
      <div className="mt-6 flex flex-col gap-4" aria-hidden="true">
        <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </div>
      <p className="sr-only" role="status">
        Cargando métricas…
      </p>
    </main>
  );
}
