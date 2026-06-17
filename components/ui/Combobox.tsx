"use client";

/**
 * Accessible text-filtered combobox (ARIA combobox pattern).
 *
 * - Typing filters options (accent-insensitive, via lib/search normalize).
 * - Keyboard: ↑/↓ move the highlight, Enter selects, Escape closes and restores the
 *   selected label, Tab closes.
 * - The dropdown is rendered in a portal on document.body and absolutely positioned over
 *   the rest of the content, so it is never clipped by overflow/stacking contexts of the
 *   card that contains the input.
 * - Clearing the input clears the selection (onChange("")).
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { normalize } from "@/lib/search";

export interface ComboboxOption {
  id: string;
  label: string;
  /**
   * Secondary text rendered muted next to the label and included in the text filter.
   * Use it to disambiguate homonyms (e.g. a school's locality — school names repeat
   * a lot across localities).
   */
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  /** Selected option id, or "" for none. */
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Extra classes for the wrapper (e.g. flex sizing inside a row). */
  className?: string;
  /** Extra classes for the <input> itself — e.g. forcing an opaque `bg-white` when the
   * combobox sits on a dark/tinted surface (the base `.input` is transparent). */
  inputClassName?: string;
  /**
   * Shown when the filtered list is empty. Callers with async options should pass a
   * loading/error-specific message — a bare "Sin resultados" while options are still
   * loading reads as "there is nothing in the platform".
   */
  emptyMessage?: string;
}

interface DropdownPosition {
  left: number;
  width: number;
  /** Viewport-relative top, when the list drops below the input (the default). */
  top?: number;
  /** Distance from the viewport bottom, when the list flips above the input. */
  bottom?: number;
  /** Cap so the list never exceeds the space visible above the soft keyboard. */
  maxHeight: number;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  emptyMessage = "Sin resultados",
}: ComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  // Sync the input text when the external selection changes (e.g. cleared by the parent,
  // or the options arrive async after mount) — state adjustment during render, no effect.
  const selectedLabel = selected?.label ?? "";
  const [lastSelectedLabel, setLastSelectedLabel] = useState(selectedLabel);
  if (selectedLabel !== lastSelectedLabel) {
    setLastSelectedLabel(selectedLabel);
    setQuery(selectedLabel);
  }

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    // When the text is exactly the selected label, the user hasn't filtered yet —
    // show everything so reopening the list isn't stuck on a single option.
    if (!q || (selected && query === selected.label)) return options;
    return options.filter((o) =>
      normalize(`${o.label} ${o.hint ?? ""}`).includes(q),
    );
  }, [options, query, selected]);

  const updatePosition = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 4;
    const margin = 8;
    // visualViewport reflects the area NOT covered by the soft keyboard; fall back to the
    // layout viewport on browsers without it. The list is positioned `fixed` (viewport
    // coordinates), so no scroll offset is needed and bottom-anchoring works for the flip-up.
    const vv = window.visualViewport;
    const visibleTop = vv?.offsetTop ?? 0;
    const visibleBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
    const spaceBelow = visibleBottom - rect.bottom - gap - margin;
    const spaceAbove = rect.top - visibleTop - gap - margin;
    // Prefer dropping below; flip up only when below is cramped (e.g. keyboard up) and above
    // has more room — so the school picker can't render under the keyboard on a tall form.
    const dropUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(288, dropUp ? spaceAbove : spaceBelow));
    const width = Math.min(rect.width, window.innerWidth - 2 * margin);
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - margin - width);
    setPosition(
      dropUp
        ? { left, width, bottom: window.innerHeight - rect.top + gap, maxHeight }
        : { left, width, top: rect.bottom + gap, maxHeight },
    );
  }, []);

  const openList = useCallback(() => {
    updatePosition();
    setHighlighted(0);
    setOpen(true);
  }, [updatePosition]);

  const close = useCallback(() => setOpen(false), []);

  // Track viewport changes while open (the portal is fixed-positioned to the viewport). The
  // visualViewport listeners catch the soft keyboard opening/closing on mobile, which resizes
  // the visible area and may require the list to flip up or shrink.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updatePosition);
    vv?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      vv?.removeEventListener("resize", updatePosition);
      vv?.removeEventListener("scroll", updatePosition);
    };
  }, [open, updatePosition]);

  // Close on click outside (the dropdown lives outside the input's DOM subtree).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) {
        return;
      }
      setQuery(selectedLabel); // discard unconfirmed filter text
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close, selectedLabel]);

  // Keep the highlighted option visible while navigating with the keyboard.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  const select = (option: ComboboxOption) => {
    onChange(option.id);
    setQuery(option.label);
    close();
  };

  const onInput = (text: string) => {
    setQuery(text);
    setHighlighted(0);
    if (!open) openList();
    // Emptying the field deselects.
    if (text.trim() === "" && value) onChange("");
  };

  // Home/End are deliberately NOT hijacked for the listbox: in an editable combobox
  // (APG pattern) they must keep moving the text caret.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setHighlighted((h) => Math.max(h - 1, 0));
        break;
      case "Enter":
        if (open && filtered[highlighted]) {
          e.preventDefault();
          select(filtered[highlighted]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setQuery(selectedLabel);
          close();
        }
        break;
      case "Tab":
        setQuery(selectedLabel);
        close();
        break;
    }
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[highlighted]
            ? `${listboxId}-opt-${highlighted}`
            : undefined
        }
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={query}
        onChange={(e) => onInput(e.target.value)}
        onFocus={openList}
        onKeyDown={onKeyDown}
        className={`input w-full pr-9 ${inputClassName ?? ""}`}
      />
      {/* Dropdown affordance the native <select> had and a bare text input lacks. */}
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>

      {open &&
        position &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              zIndex: 50,
            }}
            className="overflow-auto rounded-xl bg-white py-1.5 shadow-lg ring-1 ring-black/5"
          >
            {filtered.length === 0 ? (
              <li className="mx-1.5 px-3 py-2 text-sm text-muted">{emptyMessage}</li>
            ) : (
              filtered.map((option, i) => (
                <li
                  key={option.id}
                  id={`${listboxId}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={option.id === value}
                  // pointerDown (not click) so selection wins over the input's blur.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    select(option);
                  }}
                  onPointerEnter={() => setHighlighted(i)}
                  // Soft inset pill on highlight (mx + rounded-lg) so the active row reads
                  // as a rounded block inside the elevated card, matching the calm-depth look.
                  className={`mx-1.5 cursor-pointer rounded-lg px-3 py-2.5 text-sm ${
                    i === highlighted
                      ? "bg-brand-tint text-brand-darkest"
                      : "text-foreground"
                  }`}
                >
                  {option.label}
                  {option.hint && (
                    <span
                      className={`ml-1.5 text-xs ${
                        i === highlighted ? "text-brand-darker" : "text-muted"
                      }`}
                    >
                      {option.hint}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
