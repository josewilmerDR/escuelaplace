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
import { useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
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

  useEffect(() => {
    Promise.all([
      getBusinessById(id),
      getBusinessDailyMetrics(id, ranges.current.from, ranges.current.to),
      getBusinessDailyMetrics(id, ranges.previous.from, ranges.previous.to),
      getSubscriptionsByBusiness(id),
    ])
      .then(([b, currentDays, previousDays, subs]) => {
        setBusiness(b);
        setCurrent(summarizeDailyMetrics(currentDays));
        setPrevious(summarizeDailyMetrics(previousDays));
        setTodayWalkIns(
          currentDays.find((d) => d.day === ranges.today)?.walkIns ?? 0,
        );
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
  }, [id, ranges]);

  const onWalkIn = async (delta: 1 | -1) => {
    setRecording(true);
    setWalkInError(null);
    try {
      const result = await recordWalkIn(id, delta);
      setTodayWalkIns(result.walkIns);
      // Today always belongs to the current month window (both fixed at mount).
      setCurrent((c) =>
        c ? { ...c, walkIns: Math.max(0, c.walkIns + delta) } : c,
      );
    } catch {
      setWalkInError("No se pudo registrar. Probá de nuevo.");
    } finally {
      setRecording(false);
    }
  };

  if (!loaded) return <p className="text-sm text-muted">Cargando…</p>;

  const isManager =
    user != null &&
    business != null &&
    (business.ownerId === user.id ||
      business.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (denied || !business || !isManager) {
    return (
      <p className="text-sm text-error">
        No administrás este comercio o no se pudieron cargar sus métricas.
      </p>
    );
  }

  const EMPTY: MetricsSummary = { views: 0, contacts: 0, walkIns: 0, byChannel: {} };
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

      {!process.env.NEXT_PUBLIC_TRACK_INTERACTION_URL && (
        <p className="mt-4 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
          El conteo de eventos no está configurado en este entorno
          (NEXT_PUBLIC_TRACK_INTERACTION_URL), así que las visitas nuevas no se están
          registrando.
        </p>
      )}

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Clientes de escuelaplace
        </h2>
        <p className="mt-1 text-sm text-muted">
          Tocá el botón cada vez que un cliente mencione escuelaplace en el local —
          por ejemplo, al pedir el descuento.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => onWalkIn(1)}
            disabled={recording}
            className="btn btn-primary"
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />Cliente de escuelaplace
          </button>
          <span className="text-sm text-muted">
            Hoy:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {todayWalkIns}
            </span>{" "}
            · Este mes:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {cur.walkIns}
            </span>
            {todayWalkIns > 0 && (
              <button
                type="button"
                onClick={() => onWalkIn(-1)}
                disabled={recording}
                className="ml-3 text-xs underline hover:text-brand-darker"
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
          Es una métrica privada: existe solo para que el cálculo del retorno de tu
          apoyo sea más exacto. No afecta de ninguna forma tu posición ni el ranking
          en la plataforma — por eso contar de más no te da nada, y contar de menos
          solo empobrece tu propio reporte.
        </p>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold capitalize tracking-tight text-foreground">
            {monthLabel(ranges.current.month)}
          </h2>
          <span className="text-xs text-muted">
            vs. {monthLabel(ranges.previous.month)}
          </span>
        </div>

        {!hasActivity ? (
          <p className="mt-4 text-sm text-muted">
            Aún no hay actividad registrada. Los contadores empiezan a moverse cuando
            la gente visita tu perfil público y usa los botones de contacto.
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
              <dd className="font-semibold tabular-nums">{cur.contacts}</dd>
            </div>
            <MetricRow
              label="Clientes en el local (tu conteo)"
              value={cur.walkIns}
              prevValue={prev.walkIns}
            />
          </dl>
        )}

        {costPerContact !== null && (
          <p className="mt-4 rounded-xl bg-brand-tint p-3 text-sm text-brand-darker ring-1 ring-brand-dark/10">
            Tu apoyo activo a escuelas es {formatColones(activeSupport)} →{" "}
            <span className="font-semibold">
              ≈ {formatColones(Math.round(costPerContact))} por contacto
            </span>{" "}
            (apoyo activo ÷ contactos del mes).
          </p>
        )}
      </section>

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
  if (prevValue === 0) {
    return <span className="w-14 text-right text-xs text-muted">nuevo</span>;
  }
  const pct = Math.round(((value - prevValue) / prevValue) * 100);
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "=";
  return (
    <span className="w-14 text-right text-xs tabular-nums text-muted">
      {arrow} {pct === 0 ? "" : `${Math.abs(pct)}%`}
    </span>
  );
}
