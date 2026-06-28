"use client";

/**
 * Bingo deck (mazo) detail / management page
 * (/panel/school/[id]/bingo-decks/[deckId]).
 *
 * The board renames the deck, reviews EVERY cartón, generates/imports more, and deletes the deck.
 * Viewing the whole lote is the reason a deck has its own page (the bingo-creation picker only
 * lists decks by name + count). The cartones themselves are managed by BingoDeckCardsManager, which
 * persists immediately and keeps the deck's denormalized cardCount fresh. A deck is board-only and
 * carries no money.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BingoDeckCardsManager } from "@/components/tools/BingoDeckCardsManager";
import { PageTitle } from "@/components/ui/PageTitle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { PanelNotice } from "@/components/ui/PanelNotice";
import { userErrorMessage } from "@/lib/errors";
import { formatBingoSummary } from "@/lib/format";
import {
  bingoDeckNameError,
  deleteBingoDeck,
  getBingoDeckById,
  getSchoolById,
  renameBingoDeck,
} from "@/lib/firestore";
import {
  BINGO_DECK_NAME_MAX,
  type BingoDeckDoc,
  type SchoolDoc,
} from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

const LOADING_TEXT = "Cargando mazo…";

function Heading({ onBack, subtitle }: { onBack: () => void; subtitle?: string }) {
  return (
    <PageTitle
      onBack={onBack}
      backLabel="Volver"
      title="Editar mazo"
      subtitle={subtitle}
      reserveSubtitle
    />
  );
}

export default function BingoDeckDetailPage() {
  const { id, deckId } = useParams<{ id: string; deckId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [deck, setDeck] = useState<BingoDeckDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const [name, setName] = useState("");
  const [cardCount, setCardCount] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getBingoDeckById(id, deckId)])
      .then(([s, d]) => {
        setSchool(s);
        setDeck(d);
        if (d) {
          setName(d.name);
          setCardCount(d.cardCount);
        }
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id, deckId]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading onBack={() => router.back()} />
        <div
          className="mt-8 h-64 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
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
        <Heading onBack={() => router.back()} />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar el mazo. Revisa tu conexión e intenta de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school || !deck) {
    return (
      <PanelNotice
        heading={<Heading onBack={() => router.back()} />}
        backHref={`/panel/school/${id}/bingo-decks`}
        backLabel="Volver a mazos"
      >
        {!school ? "Escuela no encontrada." : "Mazo no encontrado."}
      </PanelNotice>
    );
  }

  const isManager = isPageManager(school, user);

  if (!isManager) {
    return (
      <PanelNotice heading={<Heading onBack={() => router.back()} subtitle={school.name} />}>
        No administras esta escuela.
      </PanelNotice>
    );
  }

  const onRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameErr = bingoDeckNameError(name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const trimmed = name.trim();
    if (trimmed === deck.name) return;
    setRenaming(true);
    setError(null);
    try {
      await renameBingoDeck(id, deckId, trimmed);
      setDeck((prev) => (prev ? { ...prev, name: trimmed } : prev));
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo renombrar el mazo."));
    } finally {
      setRenaming(false);
    }
  };

  const onDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteBingoDeck(id, deckId);
      router.push(`/panel/school/${id}/bingo-decks`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar el mazo."));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // The deck's frozen 5×5 free center, summarized read-only (set at creation, immutable here since
  // the cartones already carry its sentinel — like the format).
  const center = deck.centerSquare;
  const centerLabel = center
    ? center.type === "image"
      ? "casilla central libre (logo)"
      : center.type === "text"
        ? `casilla central libre («${center.text}»)`
        : "casilla central libre"
    : null;

  return (
    <main>
      <Heading onBack={() => router.back()} subtitle={school.name} />

      <p className="mt-6 text-sm text-muted">
        {cardCount} cartones · {formatBingoSummary(deck.format)}
        {centerLabel ? ` · ${centerLabel}` : ""}
      </p>

      {/* Rename. The format is fixed once the deck exists — its cartones are bound to it — so it
          isn't editable here; create a new mazo for a different format. */}
      <form onSubmit={onRename} className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Nombre del mazo">
          <input
            type="text"
            maxLength={BINGO_DECK_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </Field>
        <button
          type="submit"
          disabled={renaming || name.trim() === deck.name}
          className="btn btn-outline"
        >
          {renaming ? "Guardando…" : "Renombrar"}
        </button>
      </form>

      <FormError message={error} />

      <section className="mt-8">
        <BingoDeckCardsManager
          schoolId={id}
          deckId={deckId}
          format={deck.format}
          centerSquare={deck.centerSquare}
          onCountChange={setCardCount}
        />
      </section>

      {/* Risk zone: deleting a deck is irreversible (bingos already using it keep their copies). */}
      <section className="mt-12 flex flex-col items-center border-t border-border pt-6 text-center">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-sm font-semibold text-error hover:underline"
        >
          Eliminar mazo
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar mazo"
        tone="destructive"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        busy={deleting}
        busyLabel="Eliminando…"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        <p className="text-sm text-muted">
          Se quita de la biblioteca de mazos y no se puede deshacer. Los bingos que ya lo
          usaron conservan sus cartones.
        </p>
        <p className="mt-2 text-sm text-muted">
          Se elimina el mazo «{deck.name}» y sus {cardCount} cartones guardados.
        </p>
      </ConfirmDialog>
    </main>
  );
}
