"use client";

/**
 * Self-contained file picker with an explicit, button-like trigger — replaces the bare
 * native `<input type="file">` (whose "Seleccionar archivo / Ningún archivo seleccionado"
 * reads as plain text, not a clickable control). Used by the proof-upload step on the
 * donate / fund / subscribe flows. Local-only: it holds a File and the caller uploads on
 * submit. Renders its own label markup (like ImagePicker), so it must NOT be wrapped in a
 * <Field> — a <label> inside a <label> is invalid.
 */
import { useRef } from "react";
import { PaperClipIcon } from "@/components/ui/icons";

export function FilePicker({
  label,
  hint,
  value,
  onChange,
  accept = "image/*,application/pdf",
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const remove = () => {
    onChange(null);
    // Clear the native input so re-picking the same file still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label
          className={`btn btn-outline has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
            disabled ? "pointer-events-none opacity-50" : "cursor-pointer"
          }`}
          aria-disabled={disabled}
        >
          <PaperClipIcon className="mr-1.5 h-4 w-4" />
          {value ? "Cambiar archivo" : "Seleccionar archivo"}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sr-only"
            aria-label={label}
            disabled={disabled}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {value ? (
          <>
            <span className="min-w-0 max-w-full truncate text-foreground" title={value.name}>
              {value.name}
            </span>
            <button
              type="button"
              onClick={remove}
              className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
            >
              Quitar
            </button>
          </>
        ) : (
          <span className="text-muted">Ningún archivo seleccionado</span>
        )}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
