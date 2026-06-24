"use client";

/**
 * Chip-style input for the business search tags ("keywords"): the owner types a word or
 * short phrase and commits it with Enter or comma (also on blur), building a removable list
 * of chips. Free text — phrases are allowed (Amazon-style keywords). The component enforces
 * the count cap (hides the field when full) and per-tag length; final normalization
 * (trim/collapse/dedup) is the caller's job via `normalizeTags` so storage and search agree.
 */
import { useId, useState } from "react";
import { XMarkIcon } from "@/components/ui/icons";
import { normalize } from "@/lib/search";

export function TagsInput({
  label,
  hint,
  value,
  onChange,
  max,
  maxLength,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
  maxLength: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const hintId = useId();
  const full = value.length >= max;

  const add = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, maxLength);
    if (!tag) return;
    // Skip a duplicate (case/accent-insensitive) so the same keyword can't be added twice.
    if (value.some((t) => normalize(t) === normalize(tag))) {
      setDraft("");
      return;
    }
    if (value.length >= max) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const removeAt = (index: number) =>
    onChange(value.filter((_, i) => i !== index));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      // Enter would submit the surrounding form; comma is just a separator — both commit.
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      // Backspace on an empty field removes the last chip (familiar token-field behavior).
      removeAt(value.length - 1);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      )}

      {value.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-2">
          {value.map((tag, i) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm font-medium text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Quitar “${tag}”`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-error/10 hover:text-error has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="mt-1 text-xs text-muted">
          Llegaste al máximo de {max} etiquetas. Quita alguna para agregar otra.
        </p>
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          // Commit a half-typed tag on blur so a word left in the field isn't lost on save.
          onBlur={() => add(draft)}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          className="input mt-1"
        />
      )}
    </div>
  );
}
