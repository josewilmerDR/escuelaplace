"use client";

/**
 * Custom-pattern draw surface for the live pattern picker. The director toggles cells on the fixed
 * 5×5 grid, then either saves it to the school's reusable catalog and uses it ("Guardar y usar") or
 * uses it once without saving ("Usar sin guardar"). Either way it hands the parent a frozen
 * BingoActivePattern (the single arrangement = the drawn cells, all required) to start the round.
 * At least one cell is required; saving also needs a name.
 */
import { useState } from "react";
import { BingoPatternPreview } from "@/components/tools/BingoPatternPreview";
import { Field } from "@/components/ui/Field";
import { saveBingoPattern } from "@/lib/firestore";
import { userErrorMessage } from "@/lib/errors";
import {
  BINGO_CUSTOM_PATTERN_NAME_MAX,
  type BingoActivePattern,
} from "@/types";

export function BingoPatternDraw({
  schoolId,
  createdBy,
  createdByName,
  onUse,
}: {
  schoolId: string;
  createdBy: string;
  createdByName?: string;
  /** Receives the frozen pattern to start the round with (after save, or ad-hoc). */
  onUse: (active: BingoActivePattern) => void;
}) {
  const [cells, setCells] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (i: number) =>
    setCells((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const sortedCells = () => [...cells].sort((a, b) => a - b);

  const useAdHoc = () => {
    if (cells.size === 0) {
      setError("Marca al menos una casilla.");
      return;
    }
    const c = sortedCells();
    onUse({
      id: "custom:adhoc",
      name: name.trim() || "Personalizado",
      arrangements: [c],
      preview: c,
    });
  };

  const saveAndUse = async () => {
    if (cells.size === 0) {
      setError("Marca al menos una casilla.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Pon un nombre para guardar el patrón.");
      return;
    }
    const c = sortedCells();
    setSaving(true);
    setError(null);
    try {
      const id = await saveBingoPattern(schoolId, {
        name: trimmed,
        cells: c,
        createdBy,
        ...(createdByName ? { createdByName } : {}),
      });
      onUse({ id: `custom:${id}`, name: trimmed, arrangements: [c], preview: c });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo guardar el patrón."));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Toca las casillas que forman el patrón. Para ganar habrá que completarlas todas.
      </p>
      <BingoPatternPreview
        editable
        size="md"
        value={cells}
        onToggle={toggle}
      />
      <Field label="Nombre (para guardarlo)">
        <input
          type="text"
          maxLength={BINGO_CUSTOM_PATTERN_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="Ej.: Estrella"
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveAndUse}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? "Guardando…" : "Guardar y usar"}
        </button>
        <button
          type="button"
          onClick={useAdHoc}
          disabled={saving}
          className="btn btn-outline"
        >
          Usar sin guardar
        </button>
      </div>
    </div>
  );
}
