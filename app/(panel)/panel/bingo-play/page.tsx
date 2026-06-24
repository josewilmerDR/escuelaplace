"use client";

/**
 * Bingo PLAY view (/panel/bingo-play?schoolId=&toolId=) — a buyer plays their cartones live.
 *
 * The board (the numbers the school has called) streams in real time. The player MUST manually tap
 * each called number on their cartones — only called numbers are tappable — and when their marks
 * complete an enabled, not-yet-awarded pattern the matching "¡Bingo!" button lights up. Tapping it
 * files a claim the school validates and awards. This is the deliberate "precio a pagar": a
 * passive player who never marks can never win, which keeps the live experience honest.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BingoCalledStrip } from "@/components/tools/BingoCalledStrip";
import { BingoCardGrid } from "@/components/tools/BingoCardGrid";
import { BingoPatternHint } from "@/components/tools/BingoPatternHint";
import { BingoPauseNotice } from "@/components/tools/BingoPauseNotice";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { userErrorMessage } from "@/lib/errors";
import {
  createBingoClaim,
  getBingoCardsByOwner,
  getMyBingoClaims,
  getToolById,
  subscribeBingoEventState,
  subscribeMyBingoClaims,
  toolConfigOf,
} from "@/lib/firestore";
import {
  BINGO_PATTERN_LABELS,
  type BingoCardDoc,
  type BingoClaimDoc,
  type BingoEventState,
  type ToolDoc,
} from "@/types";

export default function BingoPlayPage() {
  return (
    <Suspense fallback={<PlaySkeleton />}>
      <BingoPlayContent />
    </Suspense>
  );
}

function PlaySkeleton() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Jugar bingo
      </h1>
      <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      <p className="sr-only" role="status">
        Cargando…
      </p>
    </main>
  );
}

function BingoPlayContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const toolId = params.get("toolId") ?? "";

  const [tool, setTool] = useState<ToolDoc | null>(null);
  const [cards, setCards] = useState<BingoCardDoc[]>([]);
  const [myClaims, setMyClaims] = useState<BingoClaimDoc[]>([]);
  const [state, setState] = useState<BingoEventState | null>(null);
  const [loaded, setLoaded] = useState(false);
  // marks[cardId] = the set of numbers the player has tapped on that cartón.
  const [marks, setMarks] = useState<Record<string, Set<number>>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live stream of my own claims so the school's verdict reaches the player instantly: a rejection
  // re-opens the "¡Bingo!" button (claimedCards excludes rejected) and flips this cartón's status to
  // "rechazada" — without it the play view kept showing "en revisión" forever after a one-shot read.
  useEffect(() => {
    if (!user || !schoolId || !toolId) return;
    return subscribeMyBingoClaims(schoolId, toolId, user.id, setMyClaims, () => {});
  }, [user, schoolId, toolId]);

  useEffect(() => {
    let cancelled = false;
    const lookup =
      user && schoolId && toolId
        ? Promise.all([
            getToolById(schoolId, toolId),
            getBingoCardsByOwner(schoolId, toolId, user.id),
            getMyBingoClaims(schoolId, toolId, user.id),
          ])
        : Promise.resolve(null);
    lookup
      .then((res) => {
        if (cancelled || !res) return;
        const [t, c, claims] = res;
        setTool(t);
        setCards(c);
        setMyClaims(claims);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, schoolId, toolId]);

  // Live board stream.
  useEffect(() => {
    if (!schoolId || !toolId) return;
    return subscribeBingoEventState(schoolId, toolId, setState);
  }, [schoolId, toolId]);

  const called = useMemo(
    () => new Set(state?.calledNumbers ?? []),
    [state?.calledNumbers],
  );

  // Round identity — stable within a round, changes only when the director starts a new one.
  const roundStartMs = state?.startedAt?.toMillis?.() ?? 0;
  // Reset local marks on a new round (fresh board) via the "adjust state during render" pattern
  // (React-endorsed; NOT an effect) so last round's marks don't linger on the cartones.
  const [marksRound, setMarksRound] = useState(roundStartMs);
  if (roundStartMs !== marksRound) {
    setMarksRound(roundStartMs);
    setMarks({});
  }

  if (!user || !loaded) return <PlaySkeleton />;

  const bingo = toolConfigOf(tool, "bingo");
  const invalid = !tool || tool.type !== "bingo" || !bingo;

  if (invalid) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Jugar bingo
        </h1>
        <p className="mt-4 text-sm text-muted">Este bingo no existe.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  // Easy mode: the grid only lets the player tap called numbers (a marked pattern is always
  // legitimate). Default = traditional: every cell is tappable, so the player marks by hand and may
  // err — which is why the school reviews each claim. The win check is authoritative either way.
  const assistMarking = bingo.assistMarking ?? false;
  const status = state?.status ?? "idle";
  const lastCalled = state?.calledNumbers?.at(-1);
  // The round's winning shape + the single prize it plays for (frozen snapshot) — the "cómo ganar"
  // the player aims for. `reviewing`/`winner` are the public round-status signals the console keeps.
  const activePattern = state?.activePattern ?? null;
  const activePrize = state?.activePrize ?? null;
  const reviewing = state?.reviewing ?? false;
  const winner = state?.winner ?? null;
  // The director's announced break (only while live) — shown prominently so the player knows to wait.
  const pause = status === "live" ? (state?.pause ?? null) : null;
  // Once the round has a winner it's decided — marking/claiming stops until a fresh round; status
  // 'closed' also ends play.
  const playable = status === "live" && winner == null;
  // Cartones already claimed THIS round: scope by the event's startedAt so a claim from a previous
  // round doesn't keep the button hidden after the director restarts. One pattern per round → key by
  // cardId alone.
  const claimedCards = new Set(
    myClaims
      .filter(
        (c) =>
          c.status !== "rejected" &&
          (c.createdAt?.toMillis?.() ?? 0) >= roundStartMs,
      )
      .map((c) => c.cardId),
  );

  const toggleMark = (cardId: string, n: number) => {
    // In easy mode only called numbers are markable; in traditional mode the player marks freely
    // (and may err). The grid mirrors this via the `markable` set it receives.
    if (assistMarking && !called.has(n)) return;
    setMarks((prev) => {
      const next = new Set(prev[cardId] ?? []);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return { ...prev, [cardId]: next };
    });
  };

  const claim = (card: BingoCardDoc) => {
    if (!activePattern) return;
    return runClaim(card.id, async () => {
      await createBingoClaim(schoolId, toolId, {
        cardId: card.id,
        cardLabel: card.label,
        patternId: activePattern.id,
        patternName: activePattern.name,
        claimantId: user.id,
        claimantName: user.name,
      });
      // The live subscription above reflects the new claim; no manual refresh needed.
    });
  };

  const runClaim = async (key: string, op: () => Promise<void>) => {
    setBusyKey(key);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo cantar el bingo."));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <main>
      <div className="text-sm">
        <BackLink href={`/school/${schoolId}/tool/${toolId}`}>{tool.title}</BackLink>
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        Jugar bingo
      </h1>
      <p className="mt-1 text-sm text-muted">
        {status === "live"
          ? winner != null
            ? "Esta ronda ya tiene ganador."
            : "El bingo está en vivo. Marca los números cantados en tus cartones."
          : status === "closed"
            ? "Este bingo ya cerró."
            : "El bingo aún no comenzó. Espera a que la escuela lo inicie."}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}

      {pause && (
        <div className="mt-4">
          <BingoPauseNotice pause={pause} />
        </div>
      )}

      {/* How to win this round — first, so the player knows the goal before the called board. */}
      {status === "live" && activePattern && (
        <section className={`mt-6 ${cardClass("inset")}`}>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Cómo ganar esta ronda
          </h2>
          {activePrize && (
            <p className="mt-1 text-sm">
              <span className="text-muted">Premio:</span>{" "}
              <span className="font-medium text-foreground">
                {activePrize.label}
              </span>
              {activePrize.isGrand && (
                <span className="text-muted"> · premio mayor</span>
              )}
            </p>
          )}
          <div className="mt-3">
            <BingoPatternHint pattern={activePattern} />
          </div>
        </section>
      )}

      {/* Live but the round's shape isn't set yet (legacy/no-pattern doc) — explain why there's no
          "cómo ganar" and no claim button, so the player isn't left tapping with no way to win. */}
      {status === "live" && !activePattern && (
        <section className={`mt-6 ${cardClass("inset")}`}>
          <p className="text-sm text-muted">
            La escuela aún no definió la forma de ganar de esta ronda.
          </p>
        </section>
      )}

      {/* Live board — pinned just under the sticky site header (h-16) so the called numbers stay
          visible while the player scrolls their cartones. z-20 keeps it below the header (z-40) and
          any modal (z-50) but above the cards that scroll under it; the opaque inset bg + shadow
          make it read as floating over them. */}
      <section
        className={`sticky top-16 z-20 mt-6 shadow-sm ${cardClass("inset")}`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Números cantados
          </h2>
          <p className="text-xs text-muted">
            {called.size}
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

        {/* Round status, by cartón label only (never a name). Winner takes priority over review. */}
        {winner ? (
          <p className="mt-2 rounded-lg bg-success-tint p-2 text-sm font-medium text-success ring-1 ring-success/10">
            {winner.isGrand
              ? `🏆 ¡El cartón #${winner.cardLabel} ganó el premio mayor! El bingo terminó.`
              : `🎉 ¡Ganó el cartón #${winner.cardLabel}${winner.prizeLabel ? ` — ${winner.prizeLabel}` : ""}! Espera la próxima ronda.`}
          </p>
        ) : reviewing ? (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
            🔔 Alguien cantó «¡Bingo!» — la escuela está revisando.
          </p>
        ) : null}

        <div className="mt-3">
          <BingoCalledStrip
            called={state?.calledNumbers ?? []}
            pad={String(bingo.format.poolMax).length}
          />
        </div>
      </section>

      {/* My cartones */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Mis cartones ({cards.length})
        </h2>
        {cards.length > 0 && status === "live" && !assistMarking && (
          <p className="mt-1 text-sm text-muted">
            Marca tú cada número cantado en tus cartones — el sistema no marca por
            ti. Revisa bien antes de cantar «¡Bingo!»: si el patrón no está completo,
            la escuela rechazará el reclamo.
          </p>
        )}
        {cards.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no tienes cartones asignados en este bingo. La escuela los asigna
            cuando confirma tu compra.{" "}
            <Link
              href={`/panel/bingo-order?schoolId=${schoolId}&toolId=${toolId}`}
              className="font-medium text-brand-darker hover:underline"
            >
              Comprar cartones
            </Link>
          </p>
        ) : (
          <ul className="mt-4 grid gap-6 sm:grid-cols-2">
            {cards.map((card) => {
              const cardMarks = marks[card.id] ?? new Set<number>();
              // The "¡Bingo!" button is ALWAYS offered while the round is live and this cartón hasn't
              // an open claim — the system deliberately does NOT check whether the marks complete the
              // pattern. The player decides when they've won (and the school validates), so a virtual
              // player gets no edge over someone playing on paper. A rejected claim re-opens it
              // (claimedCards excludes rejected).
              const canClaim =
                playable && activePattern != null && !claimedCards.has(card.id);
              // Celebrate the winning cartón when it's mine (the winner is public by label).
              const isWinnerCard =
                winner != null && card.label === winner.cardLabel;
              return (
                <li
                  key={card.id}
                  className={
                    cardClass("elevated", false) +
                    " p-4" +
                    (isWinnerCard ? " ring-2 ring-amber-400" : "")
                  }
                >
                  <BingoCardGrid
                    label={card.label}
                    numbers={card.numbers}
                    cols={bingo.format.cols}
                    marked={cardMarks}
                    // Easy mode restricts taps to called numbers; traditional mode lets the player
                    // mark any cell (and thus possibly err).
                    markable={assistMarking ? called : new Set(card.numbers)}
                    onToggle={playable ? (n) => toggleMark(card.id, n) : undefined}
                  />
                  <div className="mt-3 flex flex-col gap-2">
                    {canClaim && (
                      <button
                        type="button"
                        onClick={() => claim(card)}
                        disabled={busyKey === card.id}
                        className="btn btn-primary w-full"
                      >
                        ¡Bingo!
                      </button>
                    )}
                    {/* The outcome of this cartón's own claims (en revisión / ganador / rechazado);
                        renders nothing until the player has filed one. Shown alongside the button so a
                        rejected claim can be re-filed. */}
                    <ClaimStatus cardId={card.id} claims={myClaims} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

/** The player's claim outcomes for one cartón (so they see "en revisión / ganador / rechazado"). */
function ClaimStatus({
  cardId,
  claims,
}: {
  cardId: string;
  claims: BingoClaimDoc[];
}) {
  const mine = claims.filter((c) => c.cardId === cardId);
  if (mine.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs">
      {mine.map((c) => (
        <li key={c.id} className="text-muted">
          {c.patternName ??
            (c.pattern ? BINGO_PATTERN_LABELS[c.pattern] : "Bingo")}
          :{" "}
          {c.status === "pending" ? (
            <span className="font-medium text-foreground">en revisión</span>
          ) : c.status === "confirmed" ? (
            <span className="font-medium text-success">¡ganador!</span>
          ) : (
            <span className="font-medium text-error">
              rechazada — puedes volver a cantar «¡Bingo!»
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
