"use client";

/**
 * Bingo deck (mazo) library for a school (/panel/school/[id]/bingo-decks).
 *
 * A deck is a reusable lote of cartones the school saves once and reuses across many bingos. This
 * is its dedicated home: it lists the saved decks and creates a new (empty) one — name + cartón
 * format — then sends the board to the deck's detail page to generate/import and review every
 * cartón. Decks are also offered (and can be saved) inside the bingo flow, but viewing the whole
 * lote needs its own screen, so it lives here. PURELY INFORMATIONAL — no money, no public surface
 * (a deck is board-only; the public cartones are the copies on each bingo).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  BingoCenterSquareField,
  emptyCenterForm,
  toCenterSquare,
  type BingoCenterFormValue,
} from "@/components/tools/BingoCenterSquareField";
import { BackLink } from "@/components/ui/BackLink";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { PanelNotice } from "@/components/ui/PanelNotice";
import { userErrorMessage } from "@/lib/errors";
import { formatBingoSummary } from "@/lib/format";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import {
  bingoDeckNameError,
  bingoFormatError,
  createBingoDeck,
  generateBingoDeckCards,
  getBingoDecks,
  getSchoolById,
  importBingoDeckCards,
  newBingoDeckId,
  parseImportedCards,
  setBingoDeckCardCount,
  uploadBingoDeckCenterImage,
} from "@/lib/firestore";
import {
  BINGO_CARD_MAX,
  BINGO_DECK_NAME_MAX,
  type BingoDeckDoc,
  type SchoolDoc,
} from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

const LOADING_TEXT = "Cargando mazos…";

function Heading({ schoolId, subtitle }: { schoolId: string; subtitle?: string }) {
  return (
    <>
      <p className="text-sm">
        <BackLink href={`/panel/school/${schoolId}/tools/manage/bingo`}>
          Volver a bingos
        </BackLink>
      </p>
      <header className="mt-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Mazos de bingo
        </h1>
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      </header>
    </>
  );
}

export default function BingoDecksPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [decks, setDecks] = useState<BingoDeckDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Create-form state (a new deck starts empty; cartones are added on its detail page).
  const [name, setName] = useState("");
  const [rows, setRows] = useState("5");
  const [cols, setCols] = useState("5");
  const [poolMin, setPoolMin] = useState("0");
  const [poolMax, setPoolMax] = useState("75");
  // Classic 5×5 free center for this mazo (logo/text/blank). It's frozen onto the deck's cartones
  // (a sentinel at the middle cell) and onto every bingo built from it. Pre-allocate the deck id so
  // a center logo can upload to the deck's Storage path before the doc exists (mirrors newToolId).
  const [center, setCenter] = useState<BingoCenterFormValue>(emptyCenterForm);
  const [deckId] = useState(() => newBingoDeckId(id));
  // The deck's cartones are defined here, at creation: either GENERATE a quantity of random ones
  // or IMPORT pre-printed ones (paste, one per line). A deck is created once and meant to live as
  // is (it may mirror physical cartones), so its cartones are chosen up front — not in a later edit.
  const [cardMode, setCardMode] = useState<"generate" | "import">("generate");
  const [genCount, setGenCount] = useState("50");
  const [importText, setImportText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getBingoDecks(id).catch(() => [])])
      .then(([s, d]) => {
        setSchool(s);
        setDecks(d);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading schoolId={id} />
        <div
          className="mt-8 h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
          aria-hidden="true"
        />
        <p className="sr-only" role="status">
          {LOADING_TEXT}
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading schoolId={id} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los mazos. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <PanelNotice heading={<Heading schoolId={id} />}>
        Escuela no encontrada.
      </PanelNotice>
    );
  }

  const isManager = isPageManager(school, user);

  if (!isManager) {
    return (
      <PanelNotice heading={<Heading schoolId={id} subtitle={school.name} />}>
        No administras esta escuela.
      </PanelNotice>
    );
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const nameErr = bingoDeckNameError(name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const format = {
      rows: Number(rows),
      cols: Number(cols),
      poolMin: Number(poolMin),
      poolMax: Number(poolMax),
    };
    const fmtErr = bingoFormatError(format);
    if (fmtErr) {
      setError(fmtErr);
      return;
    }
    // Classic 5×5 free center (offered only there). Its cartones carry a sentinel at the middle, so
    // a free center changes generation AND import (one fewer number per line) — resolve it first.
    const centerResult = toCenterSquare(
      center,
      format.rows === 5 && format.cols === 5,
    );
    if (!centerResult.ok) {
      setError(centerResult.error);
      return;
    }
    const centerSquare = centerResult.value;
    const freeCenter = centerSquare != null;
    // The cartones are defined here. Resolve a "populate" step (or none) from the chosen mode and
    // validate its input BEFORE creating the deck, so a bad quantity / unparseable paste fails
    // without leaving an empty deck behind. `populate` writes the cartones and returns the count.
    let populate: (() => Promise<number>) | null = null;
    if (cardMode === "generate") {
      // Quantity is optional in generate mode: blank → an empty deck (add cartones later).
      const trimmedCount = genCount.trim();
      if (trimmedCount) {
        const count = Number(trimmedCount);
        if (!Number.isInteger(count) || count <= 0) {
          setError(
            "La cantidad de cartones debe ser un entero mayor a 0 (o déjala vacía).",
          );
          return;
        }
        if (count > BINGO_CARD_MAX) {
          setError(`Un mazo no puede superar ${BINGO_CARD_MAX} cartones.`);
          return;
        }
        populate = async () => {
          await generateBingoDeckCards(id, deckId, format, count, 1, freeCenter);
          return count;
        };
      }
    } else {
      // Import mode: the paste is required and must parse against the format (parseImportedCards
      // enforces the per-line count — one fewer with a free center — the column bands and the cap).
      const parsed = parseImportedCards(importText, format, freeCenter);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const cards = parsed.cards;
      populate = async () => {
        await importBingoDeckCards(id, deckId, cards);
        return cards.length;
      };
    }
    setCreating(true);
    setError(null);
    try {
      // Use the pre-allocated id (a center logo may already be uploaded under its Storage path).
      await createBingoDeck(
        id,
        {
          name: name.trim(),
          format,
          ...(centerSquare ? { centerSquare } : {}),
          createdBy: user.id,
          ...(user.name ? { createdByName: user.name } : {}),
        },
        deckId,
      );
      // Best-effort populate: the deck already exists, so a failure here must not block (nor risk a
      // duplicate deck on retry) — the detail page lets the board generate/import the cartones.
      if (populate) {
        try {
          const n = await populate();
          await setBingoDeckCardCount(id, deckId, n);
        } catch {
          // ignore — the deck is created; cartones can be added from its page
        }
      }
      router.push(`/panel/school/${id}/bingo-decks/${deckId}`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear el mazo."));
      setCreating(false);
    }
  };

  // The free center is offered only on the classic 5×5. When active it carries no number, so a
  // free-center mazo imports one fewer value per cartón (reflected in the import hint below).
  const is5x5 = Number(rows) === 5 && Number(cols) === 5;
  const freeCenterActive = is5x5 && center.type !== "normal";
  const importNumbers =
    (Number(rows) * Number(cols) || 0) - (freeCenterActive ? 1 : 0);

  return (
    <main>
      <Heading schoolId={id} subtitle={school.name} />

      <p className="mt-6 text-sm text-muted">
        Un mazo es un lote de cartones que guardas una vez y reutilizas en varios bingos.
        Crea uno acá, genera o importa sus cartones, y al crear un bingo elígelo para no
        tener que generarlos de nuevo.
      </p>

      {/* Create a new (empty) deck — cartones are added on its detail page. */}
      <section className="mt-8 rounded-2xl bg-surface p-4 ring-1 ring-black/5">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Crear un mazo
        </h2>
        <form
          onSubmit={onCreate}
          onInvalidCapture={spanishRequiredMessage}
          onInputCapture={clearValidationMessage}
          className="mt-3 flex flex-col gap-4"
        >
          <Field label="Nombre del mazo">
            <input
              type="text"
              required
              maxLength={BINGO_DECK_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Ej.: Cartones impresos 2026"
            />
          </Field>
          <div>
            <p className="text-sm font-medium text-foreground">Formato del cartón</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <Field label="Filas">
                <input
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={9}
                  value={rows}
                  onChange={(e) => setRows(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Columnas">
                <input
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={9}
                  value={cols}
                  onChange={(e) => setCols(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Número menor">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={poolMin}
                  onChange={(e) => setPoolMin(e.target.value)}
                  className="input"
                  placeholder="Ej.: 0"
                />
              </Field>
              <Field label="Número mayor">
                <input
                  type="number"
                  inputMode="numeric"
                  value={poolMax}
                  onChange={(e) => setPoolMax(e.target.value)}
                  className="input"
                  placeholder="Ej.: 75"
                />
              </Field>
            </div>
            <p className="mt-1 text-xs text-muted">
              Cada cartón tendrá {Number(rows) * Number(cols) || "—"} casillas con números
              distintos del rango indicado. El estándar es 5×5 de 0 a 75.
            </p>
          </div>

          {is5x5 && (
            <BingoCenterSquareField
              value={center}
              onChange={setCenter}
              uploadImage={(file) => uploadBingoDeckCenterImage(id, deckId, file)}
            />
          )}

          <div>
            <p className="text-sm font-medium text-foreground">Cartones del mazo</p>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="card-mode"
                  className="size-4 shrink-0"
                  checked={cardMode === "generate"}
                  onChange={() => setCardMode("generate")}
                />
                Generar cartones aleatorios
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="card-mode"
                  className="size-4 shrink-0"
                  checked={cardMode === "import"}
                  onChange={() => setCardMode("import")}
                />
                Importar cartones existentes
              </label>
            </div>

            {cardMode === "generate" ? (
              <div className="mt-3">
                <Field label="Cantidad de cartones">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={genCount}
                    onChange={(e) => setGenCount(e.target.value)}
                    className="input sm:w-48"
                    placeholder="Ej.: 50"
                  />
                </Field>
                <p className="mt-1 text-xs text-muted">
                  Se generan al crear el mazo, con números aleatorios. Deja el campo vacío
                  para crear un mazo vacío y agregar cartones después.
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <textarea
                  rows={6}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="input font-mono text-xs"
                  placeholder={`Un cartón por línea (${importNumbers || "—"} números separados por coma o espacio).\nCada columna usa su propio rango (col. 1: ${poolMin}–…, como el bingo tradicional).\nOpcional: un identificador y dos puntos al inicio.\nEj.: 001: 5, 12, 33, ...`}
                />
                <p className="mt-1 text-xs text-muted">
                  Pega tus cartones ya impresos, uno por línea. Útil cuando el mazo tiene
                  una versión física que no quieres volver a generar.
                  {freeCenterActive
                    ? " La casilla central es libre, así que pega solo los números reales (sin el centro)."
                    : ""}
                </p>
              </div>
            )}
          </div>

          <FormError message={error} />

          <button type="submit" disabled={creating} className="btn btn-primary self-start">
            {creating ? "Creando…" : "Crear mazo"}
          </button>
        </form>
      </section>

      {/* Existing decks. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Mazos guardados ({decks.length})
        </h2>
        {decks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no tienes mazos. Crea el primero arriba.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {decks.map((deck) => (
              <li key={deck.id}>
                <Link
                  href={`/panel/school/${id}/bingo-decks/${deck.id}`}
                  className="flex items-center gap-3 rounded-xl bg-surface p-3 ring-1 ring-black/5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {deck.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {deck.cardCount} cartones · {formatBingoSummary(deck.format)}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
