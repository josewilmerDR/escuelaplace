"use client";

/**
 * The start-of-round modal: the director picks the round's winning shape ("modalidad / forma de
 * ganar") BEFORE the event starts. Three sections — the 10 built-in modalidades, the school's saved
 * custom patterns (reusable across its bingos, with a delete), and "Personalizado" (the draw
 * surface). Picking a tile arms "Iniciar/Reiniciar ronda"; the draw surface starts directly. On
 * start it hands the parent a frozen BingoActivePattern; the parent calls startBingoEvent and
 * closes. Exactly one pattern per round (Reiniciar re-opens this to switch).
 */
import { useEffect, useState } from "react";
import { BingoPatternDraw } from "@/components/tools/BingoPatternDraw";
import { BingoPatternPreview } from "@/components/tools/BingoPatternPreview";
import { Modal } from "@/components/ui/Modal";
import { BINGO_BUILTIN_PATTERNS, toActivePattern } from "@/lib/bingo-patterns";
import {
  deleteSavedBingoPattern,
  getSavedBingoPatterns,
  toPatternDef,
} from "@/lib/firestore";
import { userErrorMessage } from "@/lib/errors";
import type {
  BingoActivePattern,
  BingoActivePrize,
  BingoPrizes,
  PatternDef,
  SavedBingoPatternDoc,
} from "@/types";

function tileClass(selected: boolean) {
  return `flex w-full flex-col items-center rounded-xl p-2 text-center ring-1 transition-colors ${
    selected
      ? "bg-brand-tint ring-2 ring-brand-darker"
      : "ring-black/10 hover:ring-brand-darker/40"
  }`;
}

export function BingoPatternPicker({
  open,
  onClose,
  onStart,
  prizes,
  awardedPrizes,
  schoolId,
  createdBy,
  createdByName,
  reopening = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Start the round with the chosen frozen pattern + the prize it plays for (null only for legacy
   * bingos with no configured prizes). */
  onStart: (active: BingoActivePattern, prize: BingoActivePrize | null) => void;
  /** The bingo's prizes, to choose which one THIS round plays for (minor → major). */
  prizes?: BingoPrizes;
  /** Prize labels already won this bingo — disabled in the selector and skipped by the default. */
  awardedPrizes?: string[];
  schoolId: string;
  createdBy: string;
  createdByName?: string;
  /** "Reiniciar" vs "Iniciar" — only changes the primary button copy. */
  reopening?: boolean;
}) {
  const [saved, setSaved] = useState<SavedBingoPatternDoc[]>([]);
  const [selected, setSelected] = useState<BingoActivePattern | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"pick" | "draw">("pick");
  const [error, setError] = useState<string | null>(null);

  // The prizes this round can play for, ordered MINOR → MAJOR (otros → 3° → 2° → premio mayor) — the
  // Costa Rica dynamic. The director picks one per round and the premio mayor (isGrand) goes last;
  // confirming its winner ends the whole bingo. The parent mounts this fresh each open, so the
  // default index 0 (the smallest prize) is re-applied every round — the director advances it.
  const awarded = new Set(awardedPrizes ?? []);
  const prizeOptions: {
    label: string;
    isGrand: boolean;
    rankLabel: string;
    awarded: boolean;
  }[] = prizes
    ? [
        ...prizes.others.map((label, i) => ({
          label,
          isGrand: false,
          rankLabel:
            prizes.others.length > 1 ? `Otro premio ${i + 1}` : "Otro premio",
          awarded: awarded.has(label),
        })),
        ...(prizes.third
          ? [
              {
                label: prizes.third,
                isGrand: false,
                rankLabel: "Tercer premio",
                awarded: awarded.has(prizes.third),
              },
            ]
          : []),
        ...(prizes.second
          ? [
              {
                label: prizes.second,
                isGrand: false,
                rankLabel: "Segundo premio",
                awarded: awarded.has(prizes.second),
              },
            ]
          : []),
        {
          label: prizes.first,
          isGrand: true,
          rankLabel: "Premio mayor",
          awarded: awarded.has(prizes.first),
        },
      ]
    : [];
  // Default to the first prize NOT yet awarded (minor → major); fall back to 0 if all are awarded.
  const firstAvailable = prizeOptions.findIndex((p) => !p.awarded);
  const [prizeIdx, setPrizeIdx] = useState(
    firstAvailable >= 0 ? firstAvailable : 0,
  );
  const selectedOption = prizeOptions[prizeIdx] ?? null;
  const roundPrize = (): BingoActivePrize | null =>
    selectedOption
      ? { label: selectedOption.label, isGrand: selectedOption.isGrand }
      : null;

  // The parent mounts this only while open, so selection state starts fresh on every open and the
  // effect only needs to load the school's saved catalog (no synchronous reset in the effect body).
  useEffect(() => {
    let cancelled = false;
    getSavedBingoPatterns(schoolId)
      .then((p) => {
        if (!cancelled) setSaved(p);
      })
      .catch(() => {
        if (!cancelled) setSaved([]);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const pick = (def: PatternDef) => {
    setSelected(toActivePattern(def));
    setSelectedKey(def.id);
  };

  const remove = (id: string) =>
    deleteSavedBingoPattern(schoolId, id)
      .then(() => {
        setSaved((prev) => prev.filter((p) => p.id !== id));
        if (selectedKey === `custom:${id}`) {
          setSelected(null);
          setSelectedKey(null);
        }
      })
      .catch((err) =>
        setError(userErrorMessage(err, "No se pudo eliminar el patrón.")),
      );

  return (
    <Modal
      open={open}
      title="Premio y forma de ganar de la ronda"
      onClose={onClose}
    >
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        {error && (
          <p role="alert" className="mb-3 text-sm text-error">
            {error}
          </p>
        )}

        {/* Which prize THIS round plays for (minor → major; premio mayor last). */}
        {prizeOptions.length > 0 && (
          <div className="mb-5">
            <label
              htmlFor="round-prize"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Premio de esta ronda
            </label>
            <select
              id="round-prize"
              value={prizeIdx}
              onChange={(e) => setPrizeIdx(Number(e.target.value))}
              className="input mt-2"
            >
              {prizeOptions.map((p, i) => (
                <option key={i} value={i} disabled={p.awarded}>
                  {p.rankLabel} — {p.label}
                  {p.awarded ? " (entregado)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Se juega de menor a mayor; el premio mayor va al final.
              {selectedOption?.isGrand &&
                " Suele jugarse a cartón lleno; al ganarlo, el bingo termina."}
            </p>
          </div>
        )}

        {/* Built-in modalidades */}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Modalidades
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-3">
          {BINGO_BUILTIN_PATTERNS.map((def) => (
            <li key={def.id}>
              <button
                type="button"
                onClick={() => pick(def)}
                className={tileClass(selectedKey === def.id)}
              >
                <BingoPatternPreview cells={def.preview} ariaLabel={def.name} />
                <span className="mt-2 block text-xs font-medium text-foreground">
                  {def.name}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* School's saved custom patterns */}
        {saved.length > 0 && (
          <>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
              Guardadas
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-3">
              {saved.map((sp) => {
                const def = toPatternDef(sp);
                return (
                  <li key={sp.id} className="relative">
                    <button
                      type="button"
                      onClick={() => pick(def)}
                      className={tileClass(selectedKey === def.id)}
                    >
                      <BingoPatternPreview cells={def.preview} ariaLabel={def.name} />
                      <span className="mt-2 block text-xs font-medium text-foreground">
                        {def.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(sp.id)}
                      aria-label={`Eliminar ${sp.name}`}
                      className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-xs text-muted ring-1 ring-black/10 hover:text-error"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Custom draw */}
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
          Personalizado
        </p>
        {mode === "draw" ? (
          <div className="mt-2">
            <BingoPatternDraw
              schoolId={schoolId}
              createdBy={createdBy}
              createdByName={createdByName}
              onUse={(active) => onStart(active, roundPrize())}
            />
            <button
              type="button"
              onClick={() => setMode("pick")}
              className="mt-2 text-xs text-muted hover:text-foreground"
            >
              Cancelar patrón personalizado
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode("draw");
              setSelected(null);
              setSelectedKey(null);
            }}
            className="btn btn-outline mt-2"
          >
            Dibujar un patrón
          </button>
        )}
      </div>

      {mode === "pick" && (
        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => selected && onStart(selected, roundPrize())}
            disabled={!selected}
            className="btn btn-primary"
          >
            {reopening ? "Reiniciar ronda" : "Iniciar ronda"}
          </button>
        </div>
      )}
    </Modal>
  );
}
