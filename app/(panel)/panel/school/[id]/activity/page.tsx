"use client";

/**
 * The school's unified "Actividad" inbox (/panel/school/[id]/activity).
 *
 * One queue for everything the board must confirm — support subscriptions, project
 * contributions, and the per-tool orders (raffles, product catalogs, bingos) — instead of one
 * tab per kind. The data layer (getPendingActivityBySchool) folds the five collections into a
 * single oldest-first feed of ActivityItem; here we render it with type-filter chips and a
 * per-row "Confirmar" that dispatches to the matching writer. A bulk "Confirmar todos" acts on
 * the currently-filtered view. A "Historial" toggle loads the settled items on demand
 * (getActivityHistoryBySchool), newest-first and read-only.
 *
 * PURELY INFORMATIONAL — the platform never touches the money; the board verifies each proof
 * against its own records, then a Cloud Function recomputes the downstream signals.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ClockIcon,
  FlagIcon,
  GridIcon,
  HeartIcon,
  ShoppingBagIcon,
  TicketIcon,
} from "@/components/ui/icons";
import {
  ACTIVITY_KINDS,
  confirmBingoOrder,
  confirmContribution,
  confirmProductOrder,
  confirmRaffleOrder,
  confirmSubscription,
  getActivityHistoryBySchool,
  getBingoOrderProofUrl,
  getContributionProofUrl,
  getPendingActivityBySchool,
  getProductOrderProofUrl,
  getRaffleOrderProofUrl,
  getSchoolById,
  getSubscriptionProofUrl,
  type ActivityItem,
  type ActivityKind,
} from "@/lib/firestore";
import { formatColones, formatMoney } from "@/lib/format";
import type { SchoolDoc } from "@/types";

/** Lifecycle of the initial school + pending fetch. */
type LoadState = "loading" | "error" | "loaded";
/** Which list the board is looking at: the pending inbox or the settled history. */
type View = "pending" | "history";
/** "all" plus a kind — the selected filter chip. */
type Filter = "all" | ActivityKind;

const LOADING_TEXT = "Cargando actividad…";

/** Per-kind presentation (Spanish label + icon). The data layer is kind-agnostic; the copy
 * lives here. Mirrors the tool registry's icons for the order kinds. */
const KIND_META: Record<
  ActivityKind,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  subscription: { label: "Apoyo", icon: HeartIcon },
  project_contribution: { label: "Proyecto", icon: FlagIcon },
  raffle_order: { label: "Rifa", icon: TicketIcon },
  product_order: { label: "Pedido", icon: ShoppingBagIcon },
  bingo_order: { label: "Bingo", icon: GridIcon },
};

const CHIP_BASE =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const CHIP_ON = "bg-surface text-foreground ring-1 ring-black/5";
const CHIP_OFF = "text-muted hover:bg-surface hover:text-foreground";

/** Dispatch a confirm to the writer that matches the item's kind. Bingo needs the order doc
 * (it assigns cartones atomically and can throw if too few are available); the rest take an id. */
function confirmItem(item: ActivityItem, uid: string): Promise<void> {
  switch (item.kind) {
    case "subscription":
      return confirmSubscription(item.id, uid);
    case "project_contribution":
      return confirmContribution(item.id, uid);
    case "raffle_order":
      return confirmRaffleOrder(item.id, uid);
    case "product_order":
      return confirmProductOrder(item.id, uid);
    case "bingo_order":
      return confirmBingoOrder(item.doc, uid);
  }
}

/** The private payment-proof URL for an item, by kind. null when missing/unauthorized. */
function proofUrlOf(item: ActivityItem): Promise<string | null> {
  switch (item.kind) {
    case "subscription":
      return getSubscriptionProofUrl(item.id);
    case "project_contribution":
      return getContributionProofUrl(item.id);
    case "raffle_order":
      return getRaffleOrderProofUrl(item.id);
    case "product_order":
      return getProductOrderProofUrl(item.id);
    case "bingo_order":
      return getBingoOrderProofUrl(item.id);
  }
}

/** The kind-specific detail line (what was reserved/ordered/donated). May be empty. */
function detailOf(item: ActivityItem): string {
  switch (item.kind) {
    case "subscription":
      return `${item.doc.units}×`;
    case "project_contribution":
      return item.doc.type === "in_kind"
        ? `En especie${item.doc.stageTitle ? ` · ${item.doc.stageTitle}` : ""}`
        : item.doc.stageTitle
          ? `Etapa: ${item.doc.stageTitle}`
          : "Aporte en dinero";
    case "raffle_order":
      return `N° ${item.doc.numbers
        .map((n) => String(n).padStart(2, "0"))
        .join(", ")}`;
    case "product_order":
      return `${item.doc.quantity}× ${item.doc.productName}`;
    case "bingo_order":
      return `${item.doc.quantity} ${item.doc.quantity === 1 ? "cartón" : "cartones"}`;
  }
}

/** Magnitude label: subscriptions are always CRC (formatColones, never formatMoney); the rest
 * carry their own currency. "—" when the private amount couldn't be read. */
function amountOf(item: ActivityItem): string {
  if (item.amount == null) return "—";
  return item.kind === "subscription"
    ? formatColones(item.amount)
    : formatMoney(item.amount, item.currency);
}

/** Settled-status pill for the history view. Subscriptions can be confirmed/expiring/expired;
 * every other kind that's out of the pending queue is simply confirmed. */
function settledBadge(item: ActivityItem): { label: string; tone: BadgeTone } {
  const status = item.doc.status;
  if (status === "expiring") return { label: "Por vencer", tone: "warning" };
  if (status === "expired") return { label: "Vencido", tone: "neutral" };
  return { label: "Confirmado", tone: "success" };
}

/** Per-kind counts for the chips of whichever list is showing. */
function countByKind(list: ActivityItem[]): Record<ActivityKind, number> {
  const counts = {} as Record<ActivityKind, number>;
  for (const k of ACTIVITY_KINDS) counts[k] = 0;
  for (const it of list) counts[it.kind] += 1;
  return counts;
}

/** Page heading, identical in every state so the title never shifts. */
function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Actividad
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

export default function SchoolActivityPage() {
  // useSearchParams needs a Suspense boundary to keep the route prerenderable; the fallback
  // mirrors the loading state below.
  return (
    <Suspense fallback={<ActivitySkeleton />}>
      <ActivityInner />
    </Suspense>
  );
}

function ActivitySkeleton() {
  return (
    <main>
      <Heading />
      <ul className="mt-8 flex flex-col gap-4" aria-hidden="true">
        <li className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <li className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </ul>
      <p className="sr-only" role="status">
        {LOADING_TEXT}
      </p>
    </main>
  );
}

function ActivityInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Seed the filter from ?filter= so the redirects off the old per-type routes land pre-filtered
  // (e.g. /subscriptions → /activity?filter=subscription). Unknown values fall back to "all".
  const filterParam = useSearchParams().get("filter");
  const initialFilter: Filter = (ACTIVITY_KINDS as readonly string[]).includes(
    filterParam ?? "",
  )
    ? (filterParam as ActivityKind)
    : "all";

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [view, setView] = useState<View>("pending");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accessible-only success feedback (no visual banner), announced via an aria-live region.
  const [status, setStatus] = useState<string | null>(null);
  // History is loaded lazily the first time the toggle opens it; null = not loaded yet. It is
  // invalidated (set back to null) after a confirm, since a confirmed item moves into it.
  const [history, setHistory] = useState<ActivityItem[] | null>(null);
  const [historyState, setHistoryState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  const reloadPending = useCallback(() => {
    return getPendingActivityBySchool(id).then(setItems);
  }, [id]);

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getPendingActivityBySchool(id)])
      .then(([s, list]) => {
        setSchool(s);
        setItems(list);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const loadHistory = useCallback(() => {
    setHistoryState("loading");
    getActivityHistoryBySchool(id)
      .then((h) => {
        setHistory(h);
        setHistoryState("idle");
      })
      .catch(() => setHistoryState("error"));
  }, [id]);

  const showHistory = () => {
    setView("history");
    setError(null);
    if (history === null && historyState !== "loading") loadHistory();
  };

  const activeList = useMemo(
    () => (view === "pending" ? items : (history ?? [])),
    [view, items, history],
  );
  const counts = useMemo(() => countByKind(activeList), [activeList]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? activeList
        : activeList.filter((it) => it.kind === filter),
    [activeList, filter],
  );

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") return <ActivitySkeleton />;

  if (loadState === "error") {
    return (
      <main>
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la actividad. Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <main>
        <Heading />
        <p className="mt-4 text-sm text-muted">Escuela no encontrada.</p>
        <p className="mt-8 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return (
      <main>
        <Heading subtitle={school.name} />
        <p className="mt-4 text-sm text-error">No administrás esta escuela.</p>
        <p className="mt-8 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const confirmOne = async (item: ActivityItem) => {
    if (!user) return;
    setBusyId(item.id);
    setError(null);
    setStatus(null);
    try {
      await confirmItem(item, user.id);
      await reloadPending();
      setHistory(null); // the confirmed item now belongs to history — refetch on next open
      setStatus("Confirmado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  // The explicit-count guard lives in <ConfirmDialog>; this does the work once confirmed. Acts on
  // the currently-FILTERED view (what the board sees), not always the whole feed.
  const confirmAllVisible = async () => {
    if (!user || visible.length === 0) return;
    setBusyId("all");
    setError(null);
    setStatus(null);
    const total = visible.length;
    try {
      // allSettled (not all): one failure (e.g. a bingo with too few cartones) must not block the
      // rest, and we always reload so confirmed rows leave the feed even on a partial failure.
      const results = await Promise.allSettled(
        visible.map((it) => confirmItem(it, user.id)),
      );
      await reloadPending();
      setHistory(null);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setError(`No se pudieron confirmar ${failed} de ${total}.`);
      } else {
        setStatus(`${total} confirmados.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (item: ActivityItem) => {
    setError(null);
    setStatus(null);
    const url = await proofUrlOf(item);
    if (!url) {
      setError("No se pudo abrir el comprobante.");
      return;
    }
    // A blocked popup returns null too — surface the same error so the click isn't silent.
    const win = window.open(url, "_blank", "noopener");
    if (!win) setError("No se pudo abrir el comprobante.");
  };

  /** Todos + one chip per kind present in the active list, each with its count. */
  const chips = (
    <nav aria-label="Filtrar por tipo" className="mt-6 flex flex-wrap gap-2">
      <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
        Todos ({activeList.length})
      </FilterChip>
      {ACTIVITY_KINDS.filter((k) => counts[k] > 0).map((k) => {
        const Icon = KIND_META[k].icon;
        return (
          <FilterChip
            key={k}
            active={filter === k}
            onClick={() => setFilter(k)}
          >
            <Icon className="h-4 w-4" />
            {KIND_META[k].label} ({counts[k]})
          </FilterChip>
        );
      })}
    </nav>
  );

  return (
    <main>
      <Heading subtitle={school.name} />

      {/* Accessible-only success announcement; no visual banner is needed. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {/* Pending inbox vs settled history. The pending count is known at mount; the history is
          loaded on first open. */}
      <div
        role="tablist"
        aria-label="Vista"
        className="mt-6 flex gap-2 border-b border-border"
      >
        <ViewTab
          active={view === "pending"}
          onClick={() => {
            setView("pending");
            setError(null);
          }}
        >
          Pendientes ({items.length})
        </ViewTab>
        <ViewTab active={view === "history"} onClick={showHistory}>
          Historial
        </ViewTab>
      </div>

      {view === "pending" ? (
        items.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<ClockIcon className="h-7 w-7" />}
              title="No tenés nada pendiente"
              description="Cuando alguien apoye tu escuela, aporte a un proyecto o compre en una de tus herramientas (rifa, bingo, productos…), aparecerá acá para que lo confirmes."
            />
          </div>
        ) : (
          <>
            {chips}
            <section className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Pendientes ({visible.length})
                </h2>
                {visible.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmAllOpen(true)}
                    disabled={busyId !== null}
                    className="btn btn-outline"
                  >
                    {busyId === "all" ? "Confirmando…" : "Confirmar todos"}
                  </button>
                )}
              </div>

              {error && (
                <p role="alert" className="mt-3 text-sm text-error">
                  {error}
                </p>
              )}

              <ul className="mt-4 flex flex-col gap-4">
                {visible.map((item) => (
                  <ActivityRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    busy={busyId === item.id || busyId === "all"}
                    busyLabel={busyId === item.id}
                    onConfirm={() => confirmOne(item)}
                    onViewProof={() => viewProof(item)}
                  />
                ))}
              </ul>
            </section>
          </>
        )
      ) : historyState === "loading" && history === null ? (
        <ul className="mt-8 flex flex-col gap-3" aria-hidden="true">
          <li className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </ul>
      ) : historyState === "error" ? (
        <div className="mt-8">
          <p role="alert" className="text-sm text-error">
            No pudimos cargar el historial. Revisá tu conexión e intentá de nuevo.
          </p>
          <button type="button" onClick={loadHistory} className="btn btn-outline mt-3">
            Reintentar
          </button>
        </div>
      ) : (history ?? []).length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<ClockIcon className="h-7 w-7" />}
            title="Todavía no hay nada confirmado"
            description="Lo que confirmes va a quedar registrado acá."
          />
        </div>
      ) : (
        <>
          {chips}
          <section className="mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Historial ({visible.length})
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {visible.map((item) => (
                <SettledRow key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </ul>
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmAllOpen}
        title="Confirmar todo lo pendiente"
        confirmLabel="Confirmar todos"
        onConfirm={() => {
          setConfirmAllOpen(false);
          void confirmAllVisible();
        }}
        onCancel={() => setConfirmAllOpen(false)}
      >
        Vas a confirmar {visible.length}{" "}
        {filter === "all" ? "ítems pendientes" : `de tipo “${KIND_META[filter].label}”`}.
        Esta acción no se puede deshacer.
      </ConfirmDialog>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px min-h-10 border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
        active
          ? "border-brand-darker text-foreground"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`}
    >
      {children}
    </button>
  );
}

/** The left column shared by the pending and settled rows: kind badge + actor + title + detail. */
function ItemSummary({ item }: { item: ActivityItem }) {
  const Icon = KIND_META[item.kind].icon;
  const detail = detailOf(item);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral" className="gap-1">
          <Icon className="h-3.5 w-3.5" />
          {KIND_META[item.kind].label}
        </Badge>
        <p className="font-semibold tracking-tight text-foreground">{item.who}</p>
      </div>
      {item.title && <p className="mt-1 truncate text-muted">{item.title}</p>}
      <p className="text-muted">
        {detail}
        {detail && " · "}
        {amountOf(item)}
      </p>
    </div>
  );
}

/** One pending item: summary + proof + age on the left, "Confirmar" on the right. */
function ActivityRow({
  item,
  busy,
  busyLabel,
  onConfirm,
  onViewProof,
}: {
  item: ActivityItem;
  busy: boolean;
  /** Whether THIS row is the one confirming (vs frozen by a bulk run) — drives its label. */
  busyLabel: boolean;
  onConfirm: () => void;
  onViewProof: () => void;
}) {
  return (
    <li
      className={`${cardClass("elevated")} flex items-center justify-between gap-3 text-sm`}
    >
      <div className="min-w-0">
        <ItemSummary item={item} />
        {item.proofUploaded ? (
          <button
            type="button"
            onClick={onViewProof}
            // Always-underlined + min tap height: hover:underline is invisible on touch.
            className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-brand-darker underline"
          >
            Ver comprobante
          </button>
        ) : (
          <span className="mt-1 block text-xs text-muted">Sin comprobante</span>
        )}
        {/* How long this item has waited — amber once stale, so an old queue shows at a glance. */}
        <PendingAge since={item.createdAt} />
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="btn btn-primary shrink-0"
      >
        {busyLabel ? "Confirmando…" : "Confirmar"}
      </button>
    </li>
  );
}

/** One settled item in the history view: summary on the left, status pill on the right. Read-only
 * (a quieter inset panel, no actions) — same shape the old per-type history sections had. */
function SettledRow({ item }: { item: ActivityItem }) {
  const badge = settledBadge(item);
  return (
    <li
      className={`${cardClass("inset")} flex items-center justify-between gap-3 text-sm`}
    >
      <ItemSummary item={item} />
      <Badge tone={badge.tone}>{badge.label}</Badge>
    </li>
  );
}
