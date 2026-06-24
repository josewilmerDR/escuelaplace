"use client";

/**
 * Self-contained file picker with an explicit, button-like trigger — replaces the bare
 * native `<input type="file">` (whose "Seleccionar archivo / Ningún archivo seleccionado"
 * reads as plain text, not a clickable control). Used by the proof-upload step on the
 * donate / fund / subscribe flows. Local-only: it holds a File and the caller uploads on
 * submit. Type/size are validated here (like ImagePicker) so the form only receives a
 * usable file and the user learns about a wrong/too-large file BEFORE a slow upload over
 * mobile data fails. Renders its own label markup, so it must NOT be wrapped in a <Field>
 * — a <label> inside a <label> is invalid.
 */
import { useRef, useState } from "react";
import { PaperClipIcon } from "@/components/ui/icons";

const MAX_PROOF_MB = 10;
const MAX_PROOF_BYTES = MAX_PROOF_MB * 1024 * 1024;

/** Does the file match the `accept` list? Handles mime globs (`image/*`), exact mimes
 *  (`application/pdf`) and extensions (`.pdf`). The native `accept` is only a hint the
 *  picker can bypass, so we re-check here. */
function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((tok) => {
    if (tok.startsWith(".")) return name.endsWith(tok);
    if (tok.endsWith("/*")) return type.startsWith(tok.slice(0, -1));
    return type === tok;
  });
}

/** Human file size for the chosen-file line — useful before a big upload on mobile data. */
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

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
  const [error, setError] = useState<string | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // On an invalid pick, keep any previously valid file (like ImagePicker) — just clear the
    // native input and show why, instead of silently swapping in something unusable.
    if (!matchesAccept(file, accept)) {
      setError("Ese tipo de archivo no es válido. Sube una imagen o un PDF.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setError(`El archivo no puede superar los ${MAX_PROOF_MB} MB.`);
      e.target.value = "";
      return;
    }
    setError(null);
    onChange(file);
  };

  const remove = () => {
    setError(null);
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
            onChange={onFile}
          />
        </label>
        {value ? (
          <>
            <span className="min-w-0 max-w-full truncate text-foreground" title={value.name}>
              {value.name}{" "}
              <span className="text-muted">({formatSize(value.size)})</span>
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
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
