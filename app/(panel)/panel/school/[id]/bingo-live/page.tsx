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
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BingoCalledBoard } from "@/components/tools/BingoCalledBoard";
import { BingoCardGrid } from "@/components/tools/BingoCardGrid";
import { BingoPatternPicker } from "@/components/tools/BingoPatternPicker";
import { BingoPatternPreview } from "@/components/tools/BingoPatternPreview";
import { BingoPauseNotice } from "@/components/tools/BingoPauseNotice";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { maskSatisfied, winningLineIndices } from "@/lib/bingo-patterns";
import { userErrorMessage } from "@/lib/errors";
import {
  callBingoNumber,
  confirmBingoWinner,
  getBingoCards,
  getSchoolById,
  getToolsBySchool,
  pauseBingoEvent,
  resolveBingoClaim,
  resumeBingoEvent,
  setBingoReviewing,
  startBingoEvent,
  subscribeBingoClaims,
  subscribeBingoEventState,
  undoLastCalledNumber,
} from "@/lib/firestore";
import {
  BINGO_PATTERN_LABELS,
  BINGO_PAUSE_REASON_MAX,
  type BingoActivePattern,
  type BingoActivePrize,
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
      <p className="mb-6 text-sm">
        <BackLink href={`/panel/school/${id}/tools`}>
          Todas las herramientas
        </BackLink>
      </p>
      <Heading
        subtitle={school.name}
        action={
          selected ? (
            <button
              type="button"
              onClick={() => setToolId(null)}
              className="btn btn-outline shrink-0"
            >
              {/* Short label on phones so the title + button stay on one row. */}
              <span className="sm:hidden">Salir</span>
              <span className="hidden sm:inline">Salir del en vivo</span>
            </button>
          ) : undefined
        }
      />

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
        <BingoConsole schoolId={id} tool={selected} confirmedBy={user!.id} />
      )}
    </main>
  );
}

function Heading({
  subtitle,
  action,
}: {
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Bingo en vivo
        </h1>
        <p className="mt-1 truncate text-sm text-muted">{subtitle || " "}</p>
      </div>
      {action}
    </header>
  );
}

function BingoConsole({
  schoolId,
  tool,
  confirmedBy,
}: {
  schoolId: string;
  tool: ToolDoc;
  confirmedBy: string;
}) {
  const bingo = tool.bingo!;
  const toolId = tool.id;

  const [state, setState] = useState<BingoEventState | null>(null);
  const [claims, setClaims] = useState<BingoClaimDoc[]>([]);
  const [cardsById, setCardsById] = useState<Map<string, BingoCardDoc>>(new Map());
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // "Nueva partida": the picker is open to start a BRAND-NEW bingo (wipe the awarded-prizes ledger,
  // re-offer every prize) rather than the next round of the current one. Reset on close/start.
  const [freshGame, setFreshGame] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous in-flight lock: `busy` (state) only disables buttons after the next commit, so a
  // fast double-tap could fire an action twice before that. This drops the second tap immediately.
  const inFlight = useRef(false);

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
  const status = state?.status ?? "idle";
  // The round's frozen winning shape + the single prize it plays for (one prize per round, minor →
  // major — the Costa Rica dynamic). Legacy live docs have neither; `winner` is the public result.
  const activePattern = state?.activePattern ?? null;
  const activePrize = state?.activePrize ?? null;
  const winner = state?.winner ?? null;
  // The director's announced break (null when running). Only meaningful while the game is live.
  const pause = status === "live" ? (state?.pause ?? null) : null;
  // This round's claims only: scope by the event's startedAt so claims from earlier rounds (the
  // claims subcollection persists across restarts) don't leak into the queue.
  const roundStartMs = state?.startedAt?.toMillis?.() ?? 0;
  const roundClaims = claims.filter(
    (c) => (c.createdAt?.toMillis?.() ?? 0) >= roundStartMs,
  );
  // One prize per round → the round has at most ONE winner: the first confirmed claim. Once it
  // exists the round is decided and the rest of the queue is moot.
  const roundWinnerClaim =
    roundClaims.find((c) => c.status === "confirmed") ?? null;
  // Pending claims to review (one entry per cartón) — only meaningful before the round is won.
  const pendingClaims = (() => {
    const seen = new Set<string>();
    const out: BingoClaimDoc[] = [];
    for (const c of roundClaims) {
      if (c.status !== "pending") continue;
      if (seen.has(c.cardId)) continue;
      seen.add(c.cardId);
      out.push(c);
    }
    return out;
  })();
  // The per-round modalidades are defined on the fixed 5×5 grid, so a live round only makes sense on
  // a 5×5 cartón (legacy bingos may be other sizes).
  const isStandardGrid = bingo.format.rows === 5 && bingo.format.cols === 5;

  // Reflect "a claim is under review" onto the PUBLIC event state so every watcher can show "alguien
  // cantó — revisando" (they can't read the private claims). Only while live and not yet won; guarded
  // so it writes only on change (no write loop).
  const shouldReview =
    status === "live" && !roundWinnerClaim && pendingClaims.length > 0;
  useEffect(() => {
    if (status !== "live") return;
    if ((state?.reviewing ?? false) === shouldReview) return;
    setBingoReviewing(schoolId, toolId, shouldReview).catch(() => {});
  }, [shouldReview, status, state?.reviewing, schoolId, toolId]);

  const run = async (op: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo completar la acción."));
    } finally {
      inFlight.current = false;
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
      if (resolution === "confirmed") {
        // Confirm + announce the winner ATOMICALLY (one transaction): ends the round, and closes the
        // bingo if this was the premio-mayor round. The prize is read authoritatively inside the tx,
        // so it can't desync from the claim or use a stale snapshot.
        await confirmBingoWinner(schoolId, toolId, claim.id, confirmedBy);
      } else {
        await resolveBingoClaim(schoolId, toolId, claim.id, "rejected", confirmedBy);
      }
    });

  // Start a round with the prize + pattern the director chose in the picker. A "Nueva partida"
  // (freshGame) resets the awarded-prizes ledger so the new bingo re-offers every prize; otherwise
  // this is the next round of the current bingo and the ledger carries forward.
  const onStartRound = (
    active: BingoActivePattern,
    prize: BingoActivePrize | null,
  ) => {
    const resetPrizes = freshGame;
    setPickerOpen(false);
    setFreshGame(false);
    run(() => startBingoEvent(schoolId, toolId, active, prize, resetPrizes));
  };

  // "Nueva partida": open the picker for a brand-new bingo. No explicit close — startBingoEvent's
  // setDoc REPLACES the live doc (clean board, no winner), and resetPrizes wipes the ledger. If the
  // director cancels the picker, the current bingo keeps running untouched.
  const onNewGame = () => {
    setFreshGame(true);
    setPickerOpen(true);
  };

  // Pause/resume the live game (a refrigerio, etc.). The round isn't lost — players just see a notice.
  const onPause = (minutes: number | null, reason: string | null) => {
    setPauseOpen(false);
    run(() => pauseBingoEvent(schoolId, toolId, minutes, reason));
  };
  const onResume = () => run(() => resumeBingoEvent(schoolId, toolId));

  return (
    <section className="mt-8 flex flex-col gap-6">
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

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {!isStandardGrid && (
        <p className="rounded-xl bg-surface p-3 text-sm text-muted ring-1 ring-black/5">
          El bingo en vivo con modalidades por ronda requiere un cartón de 5×5. Este
          bingo usa {bingo.format.rows}×{bingo.format.cols}; no se puede iniciar.
        </p>
      )}

      {/* Lifecycle + round outcome. One prize per round: a confirmed winner ends the round (the
          premio-mayor round ends the whole bingo). */}
      <div className="flex flex-col gap-3">
        {status === "live" && roundWinnerClaim ? (
          activePrize?.isGrand ? (
            // Premio-mayor round won → the bingo is ending (the confirm tx flips status to 'closed').
            // No "próxima ronda": there isn't one.
            <p className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10">
              🏆 ¡El cartón #{roundWinnerClaim.cardLabel} ganó el premio mayor! El
              bingo terminó.
            </p>
          ) : (
            <>
              <p className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10">
                🎉 Ronda ganada por el cartón #{roundWinnerClaim.cardLabel}
                {activePrize ? ` — ${activePrize.label}` : ""}.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={busy || !isStandardGrid}
                  className="btn btn-primary"
                >
                  Iniciar próxima ronda
                </button>
                <button
                  type="button"
                  onClick={onNewGame}
                  disabled={busy || !isStandardGrid}
                  className="btn btn-outline ml-auto"
                >
                  Nueva partida
                </button>
              </div>
            </>
          )
        ) : status === "live" ? (
          <button
            type="button"
            onClick={onNewGame}
            disabled={busy || !isStandardGrid}
            className="btn btn-outline self-start"
          >
            Nueva partida
          </button>
        ) : (
          <>
            {status === "closed" && (
              <p className="rounded-xl bg-surface p-3 text-sm text-muted ring-1 ring-black/5">
                {winner?.isGrand
                  ? `🏆 El bingo terminó: el premio mayor lo ganó el cartón #${winner.cardLabel}. Reiniciá para jugar otro bingo (se limpia el tablero).`
                  : "Bingo cerrado. Reiniciá para jugar otra ronda (se limpia el tablero)."}
              </p>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={busy || !isStandardGrid}
              className="btn btn-primary self-start"
            >
              {status === "closed" ? "Reiniciar bingo" : "Iniciar bingo"}
            </button>
          </>
        )}
      </div>

      {/* Pause control: announce a break (refrigerio, sorteo…) without losing the round. While paused
          the players see a "Bingo en pausa" notice + countdown; "Reanudar" clears it. */}
      {status === "live" &&
        (pause ? (
          <div className="flex flex-col gap-3">
            <BingoPauseNotice pause={pause} />
            <button
              type="button"
              onClick={onResume}
              disabled={busy}
              className="btn btn-primary self-start"
            >
              Reanudar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPauseOpen(true)}
            disabled={busy}
            className="btn btn-outline self-start"
          >
            Pausa
          </button>
        ))}

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

      {/* The round in play: its single prize + winning shape (what players also see). */}
      {status === "live" && (activePrize || activePattern) && (
        <div className={cardClass("inset")}>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Ronda actual
          </h3>
          {activePrize && (
            <p className="mt-1 text-sm">
              <span className="text-muted">Premio:</span>{" "}
              <span className="font-medium text-foreground">
                {activePrize.label}
              </span>
              {activePrize.isGrand && (
                <span className="text-muted"> · premio mayor (última ronda)</span>
              )}
            </p>
          )}
          {activePattern && (
            <div className="mt-3 flex items-center gap-4">
              <BingoPatternPreview
                cells={activePattern.preview}
                caption={activePattern.caption}
                ariaLabel={activePattern.name}
              />
              <p className="text-sm font-medium text-foreground">
                {activePattern.name}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Claims queue — only while the round is live and not yet decided (one prize per round). */}
      {status === "live" && !roundWinnerClaim && (
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
              // The anti-cheat verdict validates against the ROUND's authoritative pattern (the
              // school set it via the picker) — NOT the player-supplied claim.arrangements, which a
              // tampered client could forge to look winning. Legacy claims (no activePattern) fall
              // back to their enum geometry.
              const truth =
                activePattern?.arrangements ??
                (claim.pattern ? winningLineIndices(bingo.format, claim.pattern) : []);
              const valid = card ? maskSatisfied(card.numbers, truth, called) : null;
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
                        Canta «
                        {activePattern?.name ??
                          claim.patternName ??
                          (claim.pattern
                            ? BINGO_PATTERN_LABELS[claim.pattern]
                            : "Bingo")}
                        »
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
                      {activePrize?.isGrand
                        ? "Confirmar ganador y cerrar bingo"
                        : "Confirmar ganador"}
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
      )}

      {pickerOpen && (
        <BingoPatternPicker
          open
          onClose={() => {
            setPickerOpen(false);
            setFreshGame(false);
          }}
          onStart={onStartRound}
          prizes={bingo.prizes}
          // Prizes already won THIS bingo (so the picker skips them). Empty when starting a brand-new
          // bingo (idle/closed, or an explicit "Nueva partida") — a fresh bingo re-offers every prize.
          awardedPrizes={
            freshGame || status !== "live" ? [] : (state?.awardedPrizes ?? [])
          }
          schoolId={schoolId}
          createdBy={confirmedBy}
          reopening={freshGame || status === "closed"}
        />
      )}

      {pauseOpen && (
        <PauseDialog onClose={() => setPauseOpen(false)} onSubmit={onPause} />
      )}
    </section>
  );
}

/** The "Pausar el bingo" form: announce a break with an optional duration + reason (either can be
 * left blank). The countdown the players see is driven by the minutes; the reason is the "por …".
 * Mounted only while open, so its fields reset on every open without an effect. */
function PauseDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (minutes: number | null, reason: string | null) => void;
}) {
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");

  const submit = () => {
    const n = Number(minutes);
    const cleanMinutes =
      minutes.trim() === "" || !Number.isFinite(n) || n <= 0
        ? null
        : Math.round(n);
    const cleanReason = reason.trim() === "" ? null : reason.trim();
    onSubmit(cleanMinutes, cleanReason);
  };

  return (
    <Modal open title="Pausar el bingo" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="pause-minutes"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Tiempo (minutos)
          </label>
          <input
            id="pause-minutes"
            type="number"
            min={1}
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="15"
            className="input mt-2"
          />
          <p className="mt-1 text-xs text-muted">
            Opcional. Los jugadores ven una cuenta regresiva; al llegar a cero
            cambia a «reiniciamos en cualquier momento».
          </p>
        </div>
        <div>
          <label
            htmlFor="pause-reason"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Motivo
          </label>
          <input
            id="pause-reason"
            type="text"
            maxLength={BINGO_PAUSE_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Refrigerio"
            className="input mt-2"
          />
          <p className="mt-1 text-xs text-muted">Opcional.</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <button type="button" onClick={onClose} className="btn btn-outline">
          Cancelar
        </button>
        <button type="button" onClick={submit} className="btn btn-primary">
          Pausar
        </button>
      </div>
    </Modal>
  );
}
