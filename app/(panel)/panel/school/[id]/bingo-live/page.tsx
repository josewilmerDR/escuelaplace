"use client";

/**
 * Bingo LIVE console (/panel/school/[id]/bingo-live) — the school runs the game here.
 *
 * Pick one of the school's bingos, start the event, and tap numbers to "call" them; virtual
 * players watch the same board in real time. When a player cants "¡Bingo!" their claim appears in
 * the live queue with an automatic verdict (does called ∩ cartón actually complete the claimed
 * pattern?) — the anti-cheat check. The school decides: confirm (awards the pattern) or reject.
 * The system never auto-declares a winner. No money changes hands here; this is just the board.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import { BingoCalledBoard } from "@/components/tools/BingoCalledBoard";
import { BingoCardGrid } from "@/components/tools/BingoCardGrid";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { cardSatisfiesPattern } from "@/lib/bingo-patterns";
import { userErrorMessage } from "@/lib/errors";
import {
  awardBingoPattern,
  callBingoNumber,
  closeBingoEvent,
  getBingoCards,
  getSchoolById,
  getToolsBySchool,
  resolveBingoClaim,
  startBingoEvent,
  subscribeBingoClaims,
  subscribeBingoEventState,
  undoLastCalledNumber,
} from "@/lib/firestore";
import {
  BINGO_PATTERN_LABELS,
  type BingoCardDoc,
  type BingoClaimDoc,
  type BingoEventState,
  type SchoolDoc,
  type ToolDoc,
} from "@/types";

type LoadState = "loading" | "error" | "loaded";

export default function SchoolBingoLivePage() {
  // useSearchParams needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense fallback={<LiveSkeleton />}>
      <SchoolBingoLiveInner />
    </Suspense>
  );
}

function LiveSkeleton() {
  return (
    <main>
      <Heading />
      <div className="mt-8 h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
    </main>
  );
}

function SchoolBingoLiveInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Deep-linked from the Bingo tool's "Dirigir en vivo" → pre-select that bingo; without the
  // param the board picks one from the list below.
  const toolParam = useSearchParams().get("tool");

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [bingos, setBingos] = useState<ToolDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [toolId, setToolId] = useState<string | null>(toolParam);

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getToolsBySchool(id)])
      .then(([s, tools]) => {
        setSchool(s);
        setBingos(tools.filter((t) => t.type === "bingo"));
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  if (loadState === "loading") {
    return (
      <main>
        <Heading />
        <div className="mt-8 h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </main>
    );
  }
  if (loadState === "error" || !school) {
    return (
      <main>
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar la escuela. Intentá de nuevo.
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
        <p className="mt-4 text-sm text-muted">No administrás esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const selected = bingos.find((b) => b.id === toolId) ?? null;

  return (
    <main>
      <Heading subtitle={school.name} />
      <SchoolPanelNav schoolId={id} current="tools" />

      {bingos.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          Todavía no creaste ningún bingo. Creá uno desde Herramientas.
        </p>
      ) : !selected ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Elegí el bingo a dirigir
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {bingos.map((b) => (
              <li key={b.id} className={cardClass("elevated", false) + " p-5"}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold tracking-tight text-foreground">
                      {b.title}
                    </p>
                    <p className="text-xs text-muted">
                      {b.bingo
                        ? `${b.bingo.format.rows}×${b.bingo.format.cols} · ${b.bingo.format.poolMin}–${b.bingo.format.poolMax}`
                        : "Sin configurar"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setToolId(b.id)}
                    disabled={!b.bingo}
                    className="btn btn-primary"
                  >
                    Dirigir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <BingoConsole
          schoolId={id}
          tool={selected}
          confirmedBy={user!.id}
          onBack={() => setToolId(null)}
        />
      )}

      <p className="mt-8 text-sm">
        <BackLink href={`/panel/school/${id}/tools`}>
          Volver a herramientas
        </BackLink>
      </p>
    </main>
  );
}

function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Bingo en vivo
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

function BingoConsole({
  schoolId,
  tool,
  confirmedBy,
  onBack,
}: {
  schoolId: string;
  tool: ToolDoc;
  confirmedBy: string;
  onBack: () => void;
}) {
  const bingo = tool.bingo!;
  const toolId = tool.id;

  const [state, setState] = useState<BingoEventState | null>(null);
  const [claims, setClaims] = useState<BingoClaimDoc[]>([]);
  const [cardsById, setCardsById] = useState<Map<string, BingoCardDoc>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live subscriptions — the board and the claims queue update without a manual reload.
  useEffect(() => {
    const unsubState = subscribeBingoEventState(schoolId, toolId, setState);
    const unsubClaims = subscribeBingoClaims(schoolId, toolId, setClaims, () =>
      setError("No pudimos cargar los reclamos en vivo. Recargá la página."),
    );
    return () => {
      unsubState();
      unsubClaims();
    };
  }, [schoolId, toolId]);

  // The cartones, to validate claims (their numbers are immutable once created). Loaded on mount
  // and re-fetched whenever a pending claim names a cartón we don't have yet (e.g. a lote generated
  // after the console opened) so the verdict never silently shows "no se pudo cargar".
  const loadCards = useCallback(() => {
    getBingoCards(schoolId, toolId)
      .then((cards) => setCardsById(new Map(cards.map((c) => [c.id, c]))))
      .catch(() => setCardsById(new Map()));
  }, [schoolId, toolId]);

  useEffect(loadCards, [loadCards]);

  const missingCard = claims.some(
    (c) => c.status === "pending" && !cardsById.has(c.cardId),
  );
  useEffect(() => {
    if (missingCard) loadCards();
  }, [missingCard, loadCards]);

  const called = useMemo(
    () => new Set(state?.calledNumbers ?? []),
    [state?.calledNumbers],
  );
  const lastCalled = state?.calledNumbers?.at(-1);
  const awarded = new Set(state?.awardedPatterns ?? []);
  const status = state?.status ?? "idle";
  const pendingClaims = claims.filter((c) => c.status === "pending");

  const run = async (op: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo completar la acción."));
    } finally {
      setBusy(false);
    }
  };

  const onCall = (n: number) => {
    if (status !== "live") return;
    // Tap an already-called number to undo it (only meaningful for the LAST one).
    if (called.has(n)) {
      if (n === lastCalled) run(() => undoLastCalledNumber(schoolId, toolId));
      return;
    }
    run(() => callBingoNumber(schoolId, toolId, n));
  };

  const onResolve = (
    claim: BingoClaimDoc,
    resolution: "confirmed" | "rejected",
  ) =>
    run(async () => {
      await resolveBingoClaim(schoolId, toolId, claim.id, resolution, confirmedBy);
      if (resolution === "confirmed") {
        await awardBingoPattern(schoolId, toolId, claim.pattern);
      }
    });

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {tool.title}
          </h2>
          <p className="text-xs text-muted">
            Estado:{" "}
            {status === "live"
              ? "en vivo"
              : status === "closed"
                ? "cerrado"
                : "sin iniciar"}
          </p>
        </div>
        <button type="button" onClick={onBack} className="btn btn-outline">
          Cambiar bingo
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {/* Lifecycle controls */}
      <div className="flex flex-wrap gap-2">
        {status !== "live" ? (
          <button
            type="button"
            onClick={() => run(() => startBingoEvent(schoolId, toolId))}
            disabled={busy}
            className="btn btn-primary"
          >
            {status === "closed" ? "Reiniciar bingo" : "Iniciar bingo"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => run(() => closeBingoEvent(schoolId, toolId))}
            disabled={busy}
            className="btn btn-outline"
          >
            Cerrar bingo
          </button>
        )}
      </div>

      {status === "closed" && (
        <p className="rounded-xl bg-surface p-3 text-sm text-muted ring-1 ring-black/5">
          Este bingo está cerrado. Reiniciá para jugar otra ronda (se limpia el tablero).
        </p>
      )}

      {/* The board */}
      <div className={cardClass("inset")}>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Tablero {status === "live" ? "(tocá para cantar)" : ""}
          </h3>
          <p className="text-xs text-muted">
            {called.size} cantados
            {lastCalled != null && (
              <>
                {" · "}último:{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {String(lastCalled).padStart(String(bingo.format.poolMax).length, "0")}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="mt-3">
          <BingoCalledBoard
            poolMin={bingo.format.poolMin}
            poolMax={bingo.format.poolMax}
            called={called}
            lastCalled={lastCalled}
            onCall={onCall}
            disabled={busy || status !== "live"}
          />
        </div>
        {status === "live" && called.size > 0 && (
          <button
            type="button"
            onClick={() => run(() => undoLastCalledNumber(schoolId, toolId))}
            disabled={busy}
            className="mt-3 text-xs font-medium text-muted hover:text-error"
          >
            Deshacer último número
          </button>
        )}
      </div>

      {/* Awarded patterns */}
      <div className={cardClass("inset")}>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Premios
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          {bingo.patterns.map((p) => (
            <li key={p.pattern} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium text-foreground">
                  {BINGO_PATTERN_LABELS[p.pattern]}:
                </span>{" "}
                <span className="text-muted">{p.prize}</span>
              </span>
              {awarded.has(p.pattern) && (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  Entregado
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Claims queue */}
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Reclamos pendientes ({pendingClaims.length})
        </h3>
        {pendingClaims.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Sin reclamos por ahora. Aparecen acá cuando alguien canta «¡Bingo!».
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pendingClaims.map((claim) => {
              const card = cardsById.get(claim.cardId);
              // The anti-cheat verdict: does called ∩ cartón actually complete the claimed pattern?
              const valid = card
                ? cardSatisfiesPattern(card.numbers, bingo.format, claim.pattern, called)
                : null;
              return (
                <li
                  key={claim.id}
                  className={cardClass("elevated", false) + " p-4"}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold tracking-tight text-foreground">
                        {claim.claimantName} · cartón #{claim.cardLabel}
                      </p>
                      <p className="text-sm text-muted">
                        Canta «{BINGO_PATTERN_LABELS[claim.pattern]}»
                      </p>
                      {valid === true && (
                        <p className="mt-1 text-xs font-medium text-success">
                          ✓ Válido: los números cantados completan el patrón.
                        </p>
                      )}
                      {valid === false && (
                        <p className="mt-1 text-xs font-medium text-error">
                          ✗ Aún no válido con los números cantados. Revisá antes de
                          confirmar.
                        </p>
                      )}
                      {valid === null && (
                        <p className="mt-1 text-xs text-muted">
                          No se pudo cargar el cartón para validar.
                        </p>
                      )}
                    </div>
                  </div>

                  {card && (
                    <div className="mt-3 max-w-[14rem]">
                      <BingoCardGrid
                        numbers={card.numbers}
                        cols={bingo.format.cols}
                        marked={called}
                      />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => onResolve(claim, "confirmed")}
                      disabled={busy}
                      className="btn btn-primary"
                    >
                      Confirmar ganador
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolve(claim, "rejected")}
                      disabled={busy}
                      className="btn btn-outline"
                    >
                      Rechazar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
