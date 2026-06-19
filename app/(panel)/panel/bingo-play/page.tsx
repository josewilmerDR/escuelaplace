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
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BingoCalledBoard } from "@/components/tools/BingoCalledBoard";
import { BingoCardGrid } from "@/components/tools/BingoCardGrid";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { satisfiedPatterns } from "@/lib/bingo-patterns";
import { userErrorMessage } from "@/lib/errors";
import {
  createBingoClaim,
  getBingoCardsByOwner,
  getMyBingoClaims,
  getToolById,
  subscribeBingoEventState,
} from "@/lib/firestore";
import {
  BINGO_PATTERN_LABELS,
  type BingoCardDoc,
  type BingoClaimDoc,
  type BingoEventState,
  type BingoPattern,
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

  const refreshClaims = useCallback(() => {
    if (!user || !schoolId || !toolId) return;
    getMyBingoClaims(schoolId, toolId, user.id)
      .then(setMyClaims)
      .catch(() => {});
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

  if (!user || !loaded) return <PlaySkeleton />;

  const bingo = tool?.bingo;
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

  const enabledPatterns = bingo.patterns.map((p) => p.pattern);
  const awarded = new Set(state?.awardedPatterns ?? []);
  const status = state?.status ?? "idle";
  const lastCalled = state?.calledNumbers?.at(-1);

  // Patterns the player has already claimed on a given cartón (so we don't re-offer them).
  const claimedKey = (cardId: string, pattern: BingoPattern) => `${cardId}:${pattern}`;
  const claimedSet = new Set(
    myClaims
      .filter((c) => c.status !== "rejected")
      .map((c) => claimedKey(c.cardId, c.pattern)),
  );

  const toggleMark = (cardId: string, n: number) => {
    // Only called numbers are markable (the play grid already enforces this on the cell).
    if (!called.has(n)) return;
    setMarks((prev) => {
      const next = new Set(prev[cardId] ?? []);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return { ...prev, [cardId]: next };
    });
  };

  const claim = (card: BingoCardDoc, pattern: BingoPattern) =>
    runClaim(claimedKey(card.id, pattern), async () => {
      await createBingoClaim(schoolId, toolId, {
        cardId: card.id,
        cardLabel: card.label,
        pattern,
        claimantId: user.id,
        claimantName: user.name,
      });
      refreshClaims();
    });

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
          ? "El bingo está en vivo. Marcá los números cantados en tus cartones."
          : status === "closed"
            ? "Este bingo ya cerró."
            : "El bingo aún no comenzó. Esperá a que la escuela lo inicie."}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}

      {/* Live board */}
      <section className={`mt-6 ${cardClass("inset")}`}>
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
        <div className="mt-3">
          <BingoCalledBoard
            poolMin={bingo.format.poolMin}
            poolMax={bingo.format.poolMax}
            called={called}
            lastCalled={lastCalled}
          />
        </div>
      </section>

      {/* My cartones */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Mis cartones ({cards.length})
        </h2>
        {cards.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no tenés cartones asignados en este bingo. La escuela los asigna
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
              // Only marks that are STILL called count toward a win — if the school undoes a
              // number, a stale mark can't keep a "¡Bingo!" button lit (the board would reject it
              // anyway, since it validates against the called set).
              const liveMarks = new Set(
                [...cardMarks].filter((n) => called.has(n)),
              );
              // Patterns the marks complete, still open (not yet awarded), not already claimed.
              const winnable = satisfiedPatterns(
                card.numbers,
                bingo.format,
                enabledPatterns,
                liveMarks,
              ).filter(
                (p) => !awarded.has(p) && !claimedSet.has(claimedKey(card.id, p)),
              );
              return (
                <li key={card.id} className={cardClass("elevated", false) + " p-4"}>
                  <BingoCardGrid
                    label={card.label}
                    numbers={card.numbers}
                    cols={bingo.format.cols}
                    marked={cardMarks}
                    markable={called}
                    onToggle={
                      status === "live"
                        ? (n) => toggleMark(card.id, n)
                        : undefined
                    }
                  />
                  <div className="mt-3 flex flex-col gap-2">
                    {status === "live" && winnable.length > 0 ? (
                      winnable.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => claim(card, p)}
                          disabled={busyKey === claimedKey(card.id, p)}
                          className="btn btn-primary"
                        >
                          ¡Bingo! — {BINGO_PATTERN_LABELS[p]}
                        </button>
                      ))
                    ) : (
                      <ClaimStatus cardId={card.id} claims={myClaims} />
                    )}
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
          {BINGO_PATTERN_LABELS[c.pattern]}:{" "}
          {c.status === "pending" ? (
            <span className="font-medium text-foreground">en revisión</span>
          ) : c.status === "confirmed" ? (
            <span className="font-medium text-success">¡ganador!</span>
          ) : (
            <span className="font-medium text-error">rechazado</span>
          )}
        </li>
      ))}
    </ul>
  );
}
